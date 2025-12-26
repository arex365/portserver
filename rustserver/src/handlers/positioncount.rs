use actix_web::{web, HttpResponse};
use crate::db;
use mongodb::bson::doc;

pub async fn get_position_count(path: web::Path<(String, String)>, q: web::Query<std::collections::HashMap<String, String>>, client: web::Data<mongodb::Client>) -> HttpResponse {
    let (coinName, tableName) = path.into_inner();
    let side = q.get("side").map(|s| s.as_str());

    if let Some(s) = side {
        if s != "Long" && s != "Short" {
            return HttpResponse::BadRequest().json(serde_json::json!({"error":"Invalid side. Must be \"Long\" or \"Short\""}));
        }
    }

    let mut filter = doc!{"coinName": {"$regex": format!("^{}$", coinName), "$options": "i"}, "status": "open" };
    if let Some(s) = side { filter.insert("positionSide", s); }

    let coll = db::db(&client).collection::<mongodb::bson::Document>(&tableName);
    match coll.count_documents(filter, None).await {
        Ok(count) => HttpResponse::Ok().json(serde_json::json!({"message":"Position count retrieved successfully","coinName": coinName, "tableName": tableName, "status":"open","side": side.unwrap_or("all".into()), "count": count})),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()})),
    }
}
