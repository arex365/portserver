import requests
import datetime
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from tqdm import tqdm

BASE_URL = "https://fapi.binance.com"
prodMode = True

def serial(data):
    if prodMode == False:
        print(data)
def get_active_futures_symbols():
    url = f"{BASE_URL}/fapi/v1/exchangeInfo"
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()

        return [
            s["symbol"]
            for s in data["symbols"]
            if s["contractType"] == "PERPETUAL"
            and s["status"] == "TRADING"
            and s["quoteAsset"] == "USDT"
        ]
    except Exception:
        return []


def fetch_candle_data(symbol, start_time_ms):
    url = f"{BASE_URL}/fapi/v1/klines"
    params = {
        "symbol": symbol,
        "interval": "1d",
        "startTime": start_time_ms,
        "limit": 1
    }

    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()

        if not data:
            return None

        open_price = float(data[0][1])
        close_price = float(data[0][4])

        change_percent = ((close_price - open_price) / open_price) * 100 if open_price > 0 else 0

        return {
            "symbol": symbol,
            "priceChangePercent": change_percent
        }

    except Exception:
        return None


def get_all_futures_data(symbols, start_time_ms, max_workers=5):
    results = []

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [
            executor.submit(fetch_candle_data, symbol, start_time_ms)
            for symbol in symbols
        ]

        for future in tqdm(as_completed(futures), total=len(futures), desc="Fetching"):
            result = future.result()
            if result:
                results.append(result)

    return results


def get_top_gainers(futures_data, top_n=5):
    sorted_data = sorted(
        futures_data,
        key=lambda x: x["priceChangePercent"],
        reverse=True
    )
    return sorted_data[:top_n]


def run():
    serial("\nChecking top gainers...")

    symbols = get_active_futures_symbols()
    if not symbols:
        return []

    today = datetime.datetime.utcnow().replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    start_time_ms = int(today.timestamp() * 1000)

    futures_data = get_all_futures_data(symbols, start_time_ms)

    if not futures_data:
        return []

    top_gainers = get_top_gainers(futures_data, top_n=5)

    return [coin["symbol"] for coin in top_gainers]


# ===== Trade Management Logic =====

coins = []


def CloseTrade(coin):
    #remove USDT from coin
    coin = coin.replace("USDT", "")
    url = f"http://localhost:5007/manage/{coin}?tableName=Raly"
    url2 = f'http://localhost:5007/manage/{coin}?tableName=RalyRev'
    payload = {
        'Action': "CloseLong",
        "positionSize": 100
    }
    payload2 = {
        'Action': "CloseShort",
        "positionSize": 100
    }    
    try:
        response = requests.post(url, json=payload)
        response2 = requests.post(url2,json=payload2)
        serial(f"❌ Closing trade for {coin}: {response.text}")
        return response.status_code == 200
    except Exception as e:
        serial(f"❌ Failed to close trade for {coin}: {e}")
        return False


def OpenTrade(coin):
    coin = coin.replace("USDT", "")
    url = f"http://localhost:5007/manage/{coin}?tableName=Raly"
    url2 = f'http://localhost:5007/manage/{coin}?tableName=RalyRev'
    payload = {
        'Action': "Long",
        "positionSize": 100
    }
    payload2 = {
        'Action': "Short",
        "positionSize": 100
    }
    try:
        response = requests.post(url, json=payload)
        response2 = requests.post(url2,json=payload2)
        serial(f"✅ Opening trade for {coin}: {response.text}")
        return response.status_code == 200
    except Exception as e:
        serial(f"❌ Failed to open trade for {coin}: {e}")
        return False


def SetCoins(new_coins):
    global coins

    # Close coins that are no longer in top 5
    for coin in coins:
        if coin not in new_coins:
            CloseTrade(coin)

    # Open new coins that weren't previously tracked
    for coin in new_coins:
        if coin not in coins:
            OpenTrade(coin)

    coins = new_coins.copy()

    serial(f"Current Active Coins: {coins} (Total: {len(coins)})")


if __name__ == "__main__":
    while True:
        new_coins = run()
        if new_coins:
            SetCoins(new_coins)

        serial("\nSleeping for 10 minutes...\n")
        requests.get("http://localhost:5007/ping")
        time.sleep(600)
