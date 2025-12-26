# rustserver

A Rust replica of the Express trade server (subset):
- Routes implemented: /, /manage/{coin}, /gettrades, /tables, /getprice, /getprice-binance, /getPositionCount/{coin}/{table}, /getbest
- Uses Actix-web + MongoDB + reqwest
- Subscription system intentionally NOT implemented (per request)

Run:
1. Install Rust toolchain
2. Set env var MONGODB_URI (or create a `.env` file in the project root with `MONGODB_URI=`)
   export MONGODB_URI="mongodb+srv://user:pass@host/db"
   Or add a `.env` file and the server will load it automatically
3. cargo run --release

Notes:
* This is an initial implementation; further parity work & tests may be needed.
