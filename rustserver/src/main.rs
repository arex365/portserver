use actix_web::{web, App, HttpServer, middleware::Logger};
use env_logger::Env;
use dotenv::dotenv;

mod db;
mod handlers;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    dotenv().ok();
    env_logger::Builder::from_env(
        Env::default().default_filter_or("info")
    ).init();

    let mongo_uri = std::env::var("MONGODB_URI").unwrap_or_else(|_| {
        eprintln!("MONGODB_URI not set, using placeholder - set this env var before running");
        "mongodb://localhost:27017".into()
    });

    let client = db::init(&mongo_uri).await.expect("Failed to init DB");

    log::info!("Starting rustserver on http://0.0.0.0:5007");

    HttpServer::new(move || {
        App::new()
            .wrap(Logger::default())
            .app_data(web::Data::new(client.clone()))
            .route("/", web::get().to(handlers::root::index))
            .route("/ping", web::get().to(handlers::root::ping))
            .route("/health", web::get().to(handlers::root::health))
            .service(
                web::scope("")
                    .route("/manage/{coin}", web::post().to(handlers::manage::manage))
                    .route("/gettrades", web::get().to(handlers::trades::get_trades))
                    .route("/tables", web::get().to(handlers::trades::get_tables))
                    .route("/getprice", web::get().to(handlers::price::get_price_okx))
                    .route("/getprice-binance", web::get().to(handlers::price::get_price_binance))
                    .route("/getPositionCount/{coin}/{table}", web::get().to(handlers::positioncount::get_position_count))
                    .route("/getbest", web::get().to(handlers::manage::get_best))
            )
    })
    .bind(("0.0.0.0", 5007))?
    .run()
    .await
}
