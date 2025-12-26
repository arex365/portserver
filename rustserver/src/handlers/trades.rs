use actix_web::{web, HttpResponse};
use mongodb::bson::doc;
use futures::TryStreamExt;
use crate::db;
use serde::Deserialize;

#[derive(Deserialize)]
pub struct TradesQuery {
    tableName: Option<String>,
    coinName: Option<String>,
    coinname: Option<String>,
    status: Option<String>,
}

pub async fn get_trades(client: web::Data<mongodb::Client>, q: web::Query<TradesQuery>) -> HttpResponse {
    let table = q.tableName.clone().unwrap_or_else(|| "positions".into());
    let coin = q.coinName.clone().or(q.coinname.clone());
    let mut status = q.status.clone().unwrap_or_else(|| "all".into());
    status = status.to_lowercase();
    if status == "closed" { status = "close".into(); }

    let coll = db::db(&client).collection::<mongodb::bson::Document>(&table);

    let mut filter = doc!{};
    if let Some(c) = coin {
        filter.insert("coinName", doc!{"$regex": format!("^{}$", c), "$options": "i"});
    }
    if status != "all" {
        filter.insert("status", status);
    }

    match coll.find(filter, None).await {
        Ok(mut cursor) => {
            let mut trades = vec![];
            while let Some(doc) = cursor.try_next().await.unwrap_or(None) {
                trades.push(doc);
            }
            HttpResponse::Ok().json(serde_json::json!({"message": "Trades retrieved successfully", "count": trades.len(), "trades": trades}))
        }
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()})),
    }
}

pub async fn get_tables(client: web::Data<mongodb::Client>) -> HttpResponse {
    let db = db::db(&client);
    match db.list_collection_names(None).await {
        Ok(names) => {
            let tables: Vec<String> = names.into_iter().filter(|n| !n.starts_with("system.")).collect();
            HttpResponse::Ok().json(serde_json::json!({"tables": tables}))
        }
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()})),
    }
}
