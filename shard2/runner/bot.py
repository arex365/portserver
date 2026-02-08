# =====================
# IMPORTS
# =====================
import ccxt
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend, no display
import matplotlib.pyplot as plt
from datetime import datetime, timedelta, timezone
import time
import io
import os
from pathlib import Path
import traceback
import requests
import json

print(f"[STARTUP] Imports loaded successfully at {datetime.now()}")

# =====================
# PARAMETERS
# =====================
print(f"[STARTUP] Loading parameters")
TIMEFRAME = "15m"
CUP_SIZE_PCT = 2.0
START_DATE = datetime(2026, 1, 9, tzinfo=timezone.utc)  # Default: 9 Jan 2026
COLS = 20
LIMIT = 300

# Coins to process
COINS = ["ZEC", "ICP", "ENA","BAT","VET","HOOK"]

# Safety delay (seconds) to wait after candle close
SAFETY_DELAY = 20

# API server URL for managing positions
API_BASE_URL = "http://localhost:5007"
TABLE_NAME = "MAZE"
POSITION_SIZE = 100
print(f"[STARTUP] Parameters loaded")

# =====================
# EXCHANGE SETUP
# =====================
try:
    exchange = ccxt.binance({
        "enableRateLimit": True,
    })
    exchange.load_markets()
    print(f"[{datetime.now()}] Exchange initialized successfully")
except Exception as e:
    print(f"[{datetime.now()}] ERROR initializing exchange: {e}")
    print(traceback.format_exc())
    exchange = None


def check_long_position_exists(coin: str) -> bool:
    """Check if a long position already exists for this coin in MAZE table."""
    try:
        url = f"{API_BASE_URL}/positioncount"
        params = {
            "coinName": coin,
            "positionSide": "Long",
            "status": "open",
            "tableName": TABLE_NAME,
        }
        resp = requests.get(url, params=params, timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            count = data.get("count", 0)
            return count > 0
        return False
    except Exception as e:
        print(f"[{datetime.now()}] Error checking long position for {coin}: {e}")
        return False


def check_short_position_exists(coin: str) -> bool:
    """Check if a short position already exists for this coin in MAZE table."""
    try:
        url = f"{API_BASE_URL}/positioncount"
        params = {
            "coinName": coin,
            "positionSide": "Short",
            "status": "open",
            "tableName": TABLE_NAME,
        }
        resp = requests.get(url, params=params, timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            count = data.get("count", 0)
            return count > 0
        return False
    except Exception as e:
        print(f"[{datetime.now()}] Error checking short position for {coin}: {e}")
        return False


def open_long_position(coin: str) -> bool:
    """Open a long position via the /manage API."""
    try:
        url = f"{API_BASE_URL}/manage/{coin}"
        payload = {
            "Action": "Long",
            "positionSize": POSITION_SIZE,
        }
        params = {"tableName": TABLE_NAME}
        resp = requests.post(url, json=payload, params=params, timeout=5)
        if resp.status_code == 200:
            print(f"[{datetime.now()}] ✓ Opened long position for {coin} in {TABLE_NAME}")
            return True
        else:
            print(f"[{datetime.now()}] ✗ Failed to open position for {coin}: {resp.status_code} {resp.text}")
            return False
    except Exception as e:
        print(f"[{datetime.now()}] Error opening long position for {coin}: {e}")
        return False


def open_short_position(coin: str) -> bool:
    """Open a short position via the /manage API."""
    try:
        url = f"{API_BASE_URL}/manage/{coin}"
        payload = {
            "Action": "Short",
            "positionSize": POSITION_SIZE,
        }
        params = {"tableName": TABLE_NAME}
        resp = requests.post(url, json=payload, params=params, timeout=5)
        if resp.status_code == 200:
            print(f"[{datetime.now()}] ✓ Opened short position for {coin} in {TABLE_NAME}")
            return True
        else:
            print(f"[{datetime.now()}] ✗ Failed to open short position for {coin}: {resp.status_code} {resp.text}")
            return False
    except Exception as e:
        print(f"[{datetime.now()}] Error opening short position for {coin}: {e}")
        return False


def fetch_ohlcv_all(symbol: str):
    since = int(START_DATE.timestamp() * 1000)
    all_ohlcv = []

    while True:
        ohlcv = exchange.fetch_ohlcv(symbol, timeframe=TIMEFRAME, since=since, limit=LIMIT)
        if not ohlcv:
            break
        all_ohlcv.extend(ohlcv)
        since = ohlcv[-1][0] + 1
        if len(ohlcv) < LIMIT:
            break
        time.sleep(exchange.rateLimit / 1000)

    return all_ohlcv


def process_coin(coin: str, out_dir: Path):
    try:
        symbol = f"{coin}/USDT"
        if symbol not in exchange.symbols:
            alt = f"{coin}/BUSD"
            if alt in exchange.symbols:
                symbol = alt
            else:
                print(f"[{datetime.now()}] Symbol {coin} not available on OKX, skipping.")
                return

        all_ohlcv = fetch_ohlcv_all(symbol)
        if not all_ohlcv:
            print(f"[{datetime.now()}] No OHLCV for {symbol}, skipping.")
            return

        df = pd.DataFrame(all_ohlcv, columns=["timestamp", "open", "high", "low", "close", "volume"])
        df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")

        cups = []
        current_fill = 0.0
        cup_open_price = None
        cup_close_price = None
        cup_start_date = None

        for _, row in df.iterrows():
            o, c = row["open"], row["close"]
            ts = row["timestamp"]

            body_pct = abs(c - o) / o * 100
            if body_pct == 0:
                continue

            remaining = body_pct if c > o else -body_pct

            while abs(remaining) > 0:
                capacity_left = CUP_SIZE_PCT - abs(current_fill)

                if current_fill == 0 and cup_open_price is None:
                    cup_open_price = o
                    cup_start_date = ts

                if capacity_left <= 0:
                    cups.append({
                        "fill": current_fill,
                        "open": cup_open_price,
                        "close": cup_close_price,
                        "date": cup_start_date,
                    })
                    current_fill = 0.0
                    cup_open_price = None
                    cup_close_price = None
                    cup_start_date = None
                    continue

                delta = min(abs(remaining), capacity_left)
                delta *= np.sign(remaining)
                current_fill += delta
                remaining -= delta
                cup_close_price = c

                if current_fill == 0:
                    cup_open_price = None
                    cup_close_price = None
                    cup_start_date = None
                    break

        complete_cups = [cup for cup in cups if abs(cup["fill"]) >= CUP_SIZE_PCT]
        
        # Check position based on latest complete cup
        if complete_cups:
            latest_cup = complete_cups[-1]
            cup_fill = latest_cup["fill"]
            is_green_cup = cup_fill > 0  # Green = bullish (positive fill)
            
            if is_green_cup:
                print(f"[{datetime.now()}] {coin}: Latest complete cup is GREEN (bullish), fill={cup_fill:.5f}")
                # Check if long position already exists
                if check_long_position_exists(coin):
                    print(f"[{datetime.now()}] {coin}: Long position already exists in {TABLE_NAME}, skipping.")
                else:
                    print(f"[{datetime.now()}] {coin}: No long position found, opening one...")
                    open_long_position(coin)
                # Close any short position if it exists
                if check_short_position_exists(coin):
                    print(f"[{datetime.now()}] {coin}: Short position exists but latest cup is green, no action.")
            else:
                print(f"[{datetime.now()}] {coin}: Latest complete cup is RED (bearish), fill={cup_fill:.5f}")
                # Check if short position already exists
                if check_short_position_exists(coin):
                    print(f"[{datetime.now()}] {coin}: Short position already exists in {TABLE_NAME}, skipping.")
                else:
                    print(f"[{datetime.now()}] {coin}: No short position found, opening one...")
                    open_short_position(coin)
                # Close any long position if it exists
                if check_long_position_exists(coin):
                    print(f"[{datetime.now()}] {coin}: Long position exists but latest cup is red, no action.")
        else:
            print(f"[{datetime.now()}] {coin}: No complete cups available for position decision.")
        
        if not complete_cups:
            print(f"[{datetime.now()}] No complete cups for {symbol}.")
        else:
            rows = max(1, int(np.ceil(len(complete_cups) / COLS)))
            fig, ax = plt.subplots(figsize=(COLS, rows))
            ax.set_xlim(0, COLS)
            ax.set_ylim(0, rows)
            ax.set_aspect("equal")
            ax.axis("off")

            for i, cup in enumerate(complete_cups):
                fill = cup["fill"]
                o_price = cup["open"]
                c_price = cup["close"]
                date = cup["date"]

                r = rows - 1 - i // COLS
                c = i % COLS

                intensity = min(abs(fill) / CUP_SIZE_PCT, 1.0)
                color = (0.0, intensity, 0.0) if fill > 0 else (intensity, 0.0, 0.0)

                ax.add_patch(plt.Rectangle((c, r), 1, 1, color=color))

                if o_price is not None and c_price is not None and date is not None:
                    ax.text(
                        c + 0.5,
                        r + 0.5,
                        f"{date.strftime('%-d-%b')}\n{o_price:.5f}\n{c_price:.5f}",
                        ha="center",
                        va="center",
                        fontsize=6,
                        color="white",
                        weight="bold",
                    )

            plt.title(f"{symbol} {TIMEFRAME} Bucket-Fill Chart (Binance)", fontsize=14)
            plt.subplots_adjust(left=0.01, right=0.99, top=0.95, bottom=0.01)

            out_path = out_dir / f"{coin}.png"
            plt.savefig(out_path, format="png", dpi=150)
            plt.close(fig)
            print(f"[{datetime.now()}] Saved chart for {coin} -> {out_path}")

    except Exception:
        print(f"[{datetime.now()}] Error processing {coin}:\n" + traceback.format_exc())


def main():
    if not exchange:
        print(f"[{datetime.now()}] Exchange not initialized, exiting.")
        return
    
    out_dir = Path(__file__).resolve().parent / "outputs"
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"[{datetime.now()}] Starting bot: coins={COINS}, schedule=15m-candle-close+{SAFETY_DELAY}s")

    while True:
        start = time.time()
        for coin in COINS:
            process_coin(coin, out_dir)
            time.sleep(max(exchange.rateLimit / 1000, 0.5))

        elapsed = time.time() - start

        # Calculate next 15-minute candle close (quarters: :00, :15, :30, :45) in UTC,
        # then add a SAFETY_DELAY to avoid racing the candle boundary.
        now = datetime.now(timezone.utc)
        mins = now.minute
        next_min = ((mins // 15) + 1) * 15
        if next_min == 60:
            next_dt = now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
        else:
            next_dt = now.replace(minute=next_min, second=0, microsecond=0)

        scheduled_time = next_dt + timedelta(seconds=SAFETY_DELAY)
        to_sleep = (scheduled_time - now).total_seconds()
        if to_sleep < 0:
            to_sleep = 0

        print(f"[{datetime.now()}] Cycle complete, sleeping {to_sleep:.1f}s until {scheduled_time.isoformat()}")
        time.sleep(to_sleep)


if __name__ == "__main__":
    main()
