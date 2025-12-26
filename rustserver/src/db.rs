use anyhow::Result;
use mongodb::{Client, Database};
use bson::doc;

pub async fn init(uri: &str) -> Result<mongodb::Client> {
    let client = Client::with_uri_str(uri).await?;
    // ensure connection by ping
    let db = client.database("TradeServer");
    db.run_command(doc! {"ping": 1}, None).await?;
    Ok(client)
}

pub fn db(client: &Client) -> Database {
    client.database("TradeServer")
}
