use actix_web::{HttpResponse, web};
use serde_json::json;
use bson::doc;
use crate::db;

pub async fn index() -> HttpResponse {
    HttpResponse::Ok().body("Hello, World from rustserver!")
}

pub async fn ping() -> HttpResponse {
    HttpResponse::Ok().json(json!({"status": "ok"}))
}

pub async fn health(client: web::Data<mongodb::Client>) -> HttpResponse {
    match db::db(&client).run_command(doc! {"ping": 1}, None).await {
        Ok(_) => HttpResponse::Ok().json(json!({"status": "ok", "db": "connected"})),
        Err(e) => HttpResponse::InternalServerError().json(json!({"status": "error", "db_error": e.to_string()})),
    }
}
