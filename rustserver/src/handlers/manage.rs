use actix_web::{web, HttpResponse};
use serde::Deserialize;
use crate::db;
use mongodb::{bson::{doc, oid::ObjectId, DateTime, Bson}, options::FindOptions};
use reqwest::Client;
use chrono::Utc;
use futures::TryStreamExt;
use regex::Regex;

#[derive(Deserialize)]
pub struct ManagePayload {
    pub Action: String,
    pub positionSize: Option<f64>,
    pub id: Option<String>,
    pub filter: Option<serde_json::Value>,
}

const FEE_RATE: f64 = 0.0002;

async fn fetch_price_binance(coin: &str) -> anyhow::Result<f64> {
    let sym = coin.to_uppercase();
    let symbol = format!("{}USDT", sym);
    let url = format!("https://fapi.binance.com/fapi/v1/ticker/price?symbol={}", symbol);
    let resp = Client::new().get(&url).send().await?;
    let v: serde_json::Value = resp.json().await?;
    if let Some(p) = v.get("price").and_then(|p| p.as_str()).and_then(|s| s.parse::<f64>().ok()) {
        Ok(p)
    } else {
        Err(anyhow::anyhow!("Invalid binance response"))
    }
}

async fn fetch_price(coin: &str) -> anyhow::Result<f64> {
    // try binance first
    fetch_price_binance(coin).await
}

pub async fn manage(client: web::Data<mongodb::Client>, path: web::Path<String>, payload: web::Json<ManagePayload>, q: web::Query<std::collections::HashMap<String,String>>) -> HttpResponse {
    let coin = path.into_inner();
    let mut collection_name = q.get("tableName").cloned().unwrap_or_else(|| "positions".into());
    if !Regex::new(r"^[A-Za-z0-9_]+$").unwrap().is_match(&collection_name) { collection_name = "positions".into(); }

    let coll = db::db(&client).collection::<mongodb::bson::Document>(&collection_name);
    let action = payload.Action.as_str();

    match action {
        "Long" | "Short" => {
            // check existing open
            let side = if action == "Long" { "Long" } else { "Short" };
            let count = coll.count_documents(doc!{"coinName": &coin, "positionSide": side, "status": "open"}, None).await.unwrap_or(0);
            if count > 0 { return HttpResponse::BadRequest().json(serde_json::json!({"message": format!("{} position already open for this coin", side)})); }

            // close opposite side locally
            let opposite = if side == "Long" { "Short" } else { "Long" };
            // simple local close: find and update
            if let Ok(_) = coll.update_many(doc!{"coinName": &coin, "positionSide": opposite, "status": "open"}, doc!{"$set": {"status": "close"}}, None).await {}

            // fetch price
            let entry_price = match fetch_price(&coin).await {
                Ok(p) => p,
                Err(e) => return HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()})),
            };

            let size = payload.positionSize.unwrap_or(0.0);
            let doc = doc!{
                "entryTime": (Utc::now().timestamp()),
                "exitTime": 0,
                "coinName": &coin,
                "positionSide": side,
                "positionSize": size,
                "entryPrice": entry_price,
                "exitPrice": Bson::Null,
                "status": "open",
                "grossPnl": Bson::Null,
                "fee": 0.0,
                "pnl": Bson::Null,
                "maxProfit": 0.0,
                "minProfit": 0.0,
                "maxProfitTime": Bson::Null,
                "minProfitTime": Bson::Null,
            };

            match coll.insert_one(doc, None).await {
                Ok(r) => HttpResponse::Ok().json(serde_json::json!({"message": format!("{} position opened", side), "coinName": coin, "entryPrice": entry_price, "positionSize": size, "status": "open", "id": r.inserted_id})),
                Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()})),
            }
        }
        "CloseLong" | "CloseShort" => {
            let side = if action == "CloseLong" { "Long" } else { "Short" };
            let exit_price = match fetch_price(&coin).await { Ok(p) => p, Err(e) => return HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()})), };
            let exit_time = Utc::now().timestamp();

            let cursor = coll.find(doc!{"coinName": &coin, "positionSide": side, "status": "open"}, None).await;
            match cursor {
                Ok(mut c) => {
                    let mut closed_positions = vec![];
                    while let Some(pos) = c.try_next().await.unwrap_or(None) {
                        let entry_price = pos.get_f64("entryPrice").unwrap_or(0.0);
                        let position_size = pos.get_f64("positionSize").unwrap_or(0.0);
                        let quantity = position_size / entry_price;
                        let gross_pnl = if side == "Long" { (exit_price - entry_price) * quantity } else { (entry_price - exit_price) * quantity };
                        let fee = position_size * FEE_RATE * 2.0;
                        let pnl = gross_pnl - fee;
                        let id = pos.get_object_id("_id").unwrap().clone();

                        let _ = coll.update_one(doc!{"_id": &id}, doc!{"$set": {"exitTime": exit_time, "exitPrice": exit_price, "status": "close", "grossPnl": gross_pnl, "fee": fee, "pnl": pnl}}, None).await;

                        closed_positions.push(serde_json::json!({"id": id, "entryPrice": entry_price, "exitPrice": exit_price, "pnl": pnl}));
                    }

                    return HttpResponse::Ok().json(serde_json::json!({"message": format!("{} positions closed", side), "coinName": coin, "exitPrice": exit_price, "positionsClosed": closed_positions.len(), "closedPositions": closed_positions}));
                }
                Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()})),
            }
        }
        "CloseById" => {
            let id = match payload.id.clone() { Some(s) => s, None => return HttpResponse::BadRequest().json(serde_json::json!({"error": "id required"})), };
            let obj = match ObjectId::parse_str(&id) { Ok(o) => o, Err(_) => return HttpResponse::BadRequest().json(serde_json::json!({"error": "Invalid id"})), };
            let pos = coll.find_one(doc!{"_id": obj.clone()}, None).await.unwrap_or(None);
            if pos.is_none() { return HttpResponse::NotFound().json(serde_json::json!({"message":"Position not found"})); }
            let position = pos.unwrap();
            let exit_price = match fetch_price(&position.get_str("coinName").unwrap()).await { Ok(p) => p, Err(e) => return HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()})), };
            let exit_time = Utc::now().timestamp();
            let entry_price = position.get_f64("entryPrice").unwrap_or(0.0);
            let position_size = position.get_f64("positionSize").unwrap_or(0.0);
            let quantity = position_size / entry_price;
            let gross_pnl = if position.get_str("positionSide").unwrap() == "Long" { (exit_price - entry_price) * quantity } else { (entry_price - exit_price) * quantity };
            let fee = position_size * FEE_RATE * 2.0;
            let pnl = gross_pnl - fee;
            let _ = coll.update_one(doc!{"_id": obj.clone()}, doc!{"$set": {"exitTime": exit_time, "exitPrice": exit_price, "status": "close", "grossPnl": gross_pnl, "fee": fee, "pnl": pnl}}, None).await;
            return HttpResponse::Ok().json(serde_json::json!({"message": "Position closed", "id": id, "exitTime": exit_time, "exitPrice": exit_price, "grossPnl": gross_pnl, "fee": fee, "pnl": pnl}));
        }
        "UpdateProfits" => {
            // iterate open positions and update max/min
            let mut cursor = match coll.find(doc!{"status": "open"}, None).await { Ok(c) => c, Err(e) => return HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()})), };
            let mut updated = 0;
            while let Some(pos) = cursor.try_next().await.unwrap_or(None) {
                let coin = pos.get_str("coinName").unwrap();
                if let Ok(price) = fetch_price(coin).await {
                    let current_profit = {
                        let entry_price = pos.get_f64("entryPrice").unwrap_or(0.0);
                        let position_size = pos.get_f64("positionSize").unwrap_or(0.0);
                        let quantity = position_size / entry_price;
                        if pos.get_str("positionSide").unwrap() == "Long" { (price - entry_price) * quantity - position_size * FEE_RATE } else { (entry_price - price) * quantity - position_size * FEE_RATE }
                    };
                    let mut max_profit = pos.get_f64("maxProfit").unwrap_or(0.0);
                    let mut min_profit = pos.get_f64("minProfit").unwrap_or(0.0);
                    let mut updated_flag = false;
                    let now = Utc::now().timestamp();
                    if current_profit > max_profit { max_profit = current_profit; let _ = coll.update_one(doc!{"_id": pos.get_object_id("_id").unwrap()}, doc!{"$set": {"maxProfit": max_profit, "maxProfitTime": now}}, None).await; updated_flag = true; }
                    if current_profit < min_profit { min_profit = current_profit; let _ = coll.update_one(doc!{"_id": pos.get_object_id("_id").unwrap()}, doc!{"$set": {"minProfit": min_profit, "minProfitTime": now}}, None).await; updated_flag = true; }
                    if updated_flag { updated += 1; }
                }
            }
            return HttpResponse::Ok().json(serde_json::json!({"message": "Profit tracking updated", "updatedPositions": updated}));
        }
        "RecalculateHistoricalProfits" => {
            // For closed positions, use Binance candles to determine min/max
            let mut cursor = match coll.find(doc!{"status": "close", "entryTime": {"$exists": true}, "exitTime": {"$exists": true, "$ne": 0}}, None).await { Ok(c) => c, Err(e) => return HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()})), };
            let mut updated = 0;
            while let Some(pos) = cursor.try_next().await.unwrap_or(None) {
                if let (Ok(entry_time), Ok(exit_time)) = (pos.get_i64("entryTime"), pos.get_i64("exitTime")) {
                    let coinsym = pos.get_str("coinName").unwrap();
                    // fetch candles
                    let url = format!("https://fapi.binance.com/fapi/v1/klines?symbol={}USDT&interval=15m&startTime={}&endTime={}&limit=1000", coinsym.to_uppercase(), entry_time*1000, exit_time*1000);
                    if let Ok(resp) = Client::new().get(&url).send().await {
                        if let Ok(candles) = resp.json::<serde_json::Value>().await {
                            if let Some(arr) = candles.as_array() {
                                // calculate min/max
                                let mut max_profit = std::f64::MIN;
                                let mut min_profit = std::f64::MAX;
                                let entry_price = pos.get_f64("entryPrice").unwrap_or(0.0);
                                let position_size = pos.get_f64("positionSize").unwrap_or(0.0);
                                let quantity = position_size / entry_price;
                                for c in arr {
                                    if let (Some(high), Some(low), Some(close)) = (c.get(2).and_then(|v| v.as_str()).and_then(|s| s.parse::<f64>().ok()), c.get(3).and_then(|v| v.as_str()).and_then(|s| s.parse::<f64>().ok()), c.get(4).and_then(|v| v.as_str()).and_then(|s| s.parse::<f64>().ok())) {
                                        // evaluate high, low, close
                                        for price in &[high, low, close] {
                                            let gross = if pos.get_str("positionSide").unwrap() == "Long" { (price - entry_price) * quantity } else { (entry_price - price) * quantity };
                                            let net = gross - position_size * FEE_RATE;
                                            if net > max_profit { max_profit = net; }
                                            if net < min_profit { min_profit = net; }
                                        }
                                    }
                                }
                                if max_profit != std::f64::MIN && min_profit != std::f64::MAX {
                                    let _ = coll.update_one(doc!{"_id": pos.get_object_id("_id").unwrap()}, doc!{"$set": {"maxProfit": max_profit, "minProfit": min_profit}}, None).await;
                                    updated += 1;
                                }
                            }
                        }
                    }
                }
            }
            return HttpResponse::Ok().json(serde_json::json!({"message": "Historical profit recalculation completed", "updatedPositions": updated}));
        }
        "DeleteById" => {
            let id = match payload.id.clone() { Some(s) => s, None => return HttpResponse::BadRequest().json(serde_json::json!({"error":"id required"})), };
            let obj = match ObjectId::parse_str(&id) { Ok(o) => o, Err(_) => return HttpResponse::BadRequest().json(serde_json::json!({"error":"Invalid id"})), };
            match coll.find_one_and_delete(doc!{"_id": obj.clone()}, None).await {
                Ok(Some(doc)) => HttpResponse::Ok().json(serde_json::json!({"message":"Position deleted successfully","id": id})),
                Ok(None) => HttpResponse::NotFound().json(serde_json::json!({"message":"Position not found"})),
                Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()})),
            }
        }
        "BulkDelete" => {
            if payload.filter.is_none() { return HttpResponse::BadRequest().json(serde_json::json!({"error":"filter required"})); }
            let filter = payload.filter.clone().unwrap();
            // NOTE: This naive impl expects a bson doc encoded as JSON (simple use only)
            let bson_filter = bson::to_document(&filter).unwrap_or_default();
            match coll.delete_many(bson_filter.clone(), None).await {
                Ok(result) => HttpResponse::Ok().json(serde_json::json!({"message":"Bulk delete completed","deletedCount": result.deleted_count})),
                Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()})),
            }
        }
        _ => HttpResponse::BadRequest().json(serde_json::json!({"error":"Invalid Action"})),
    }
}

pub async fn get_best(client: web::Data<mongodb::Client>, q: web::Query<std::collections::HashMap<String,String>>) -> HttpResponse {
    let table = q.get("table").cloned().unwrap_or_else(|| "positions".into());
    let coll = db::db(&client).collection::<mongodb::bson::Document>(&table);
    let mut cursor = match coll.find(doc!{"status": "close"}, None).await { Ok(c) => c, Err(e) => return HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()})), };
    let mut coin_perf = std::collections::HashMap::<String, (f64, i64, i64, i64)>::new(); // coin -> (totalPnl, trades, wins, losses)
    while let Some(doc) = cursor.try_next().await.unwrap_or(None) {
        let coin = doc.get_str("coinName").unwrap_or("?").to_string();
        let pnl = doc.get_f64("pnl").unwrap_or(0.0);
        let entry = coin_perf.entry(coin).or_insert((0.0, 0, 0, 0));
        entry.0 += pnl; entry.1 += 1; if pnl > 0.0 { entry.2 += 1; } else if pnl < 0.0 { entry.3 += 1; }
    }
    let mut coins: Vec<_> = coin_perf.into_iter().map(|(k,v)| serde_json::json!({"coinName": k, "totalPnl": (v.0), "tradeCount": v.1, "winCount": v.2, "lossCount": v.3, "winRate": if v.1>0 { ((v.2 as f64 / v.1 as f64)*100.0) } else { 0.0 } })).collect();
    coins.sort_by(|a,b| b.get("totalPnl").unwrap().as_f64().partial_cmp(&a.get("totalPnl").unwrap().as_f64()).unwrap());
    HttpResponse::Ok().json(serde_json::json!({"message":"Best performing coins retrieved successfully","tableName": table, "totalCoins": coins.len(), "coins": coins}))
}
