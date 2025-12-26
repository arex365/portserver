use actix_web::{web, HttpResponse};
use reqwest::Client;
use anyhow::anyhow;
use serde::Deserialize;

#[derive(Deserialize)]
pub struct PriceQuery {
    pub coinname: String,
}

async fn fetch_binance_futures_price(coin: &str) -> anyhow::Result<f64> {
    let sym = coin.to_uppercase();
    let symbol = format!("{}USDT", sym);
    let url = format!("https://fapi.binance.com/fapi/v1/ticker/price?symbol={}", symbol);
    let resp = Client::new().get(&url).send().await?;
    let v: serde_json::Value = resp.json().await?;
    if let Some(price_str) = v.get("price").and_then(|p| p.as_str()) {
        if let Ok(price) = price_str.parse::<f64>() {
            return Ok(price);
        }
    }
    Err(anyhow!("Invalid Binance response"))
}

// Keep /getprice endpoint but use Binance futures only
pub async fn get_price_okx(q: web::Query<PriceQuery>) -> HttpResponse {
    match fetch_binance_futures_price(&q.coinname).await {
        Ok(price) => HttpResponse::Ok().json(serde_json::json!({"price": price})),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()})),
    }
}

pub async fn get_price_binance(q: web::Query<PriceQuery>) -> HttpResponse {
    match fetch_binance_futures_price(&q.coinname).await {
        Ok(price) => HttpResponse::Ok().json(serde_json::json!({"price": price})),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()})),
    }
}
