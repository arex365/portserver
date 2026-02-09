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

# Global tracking dictionaries
used = {}  # used[cup_id] = bool
state = {}  # state[coin] = "long", "short", or None

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
            gmt5_time = datetime.now(timezone.utc) + timedelta(hours=5)
            print(f"[{datetime.now()}] ✓ Opened long position for {coin} in {TABLE_NAME} at {gmt5_time.strftime('%I:%M %p')} GMT+5")
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
            gmt5_time = datetime.now(timezone.utc) + timedelta(hours=5)
            print(f"[{datetime.now()}] ✓ Opened short position for {coin} in {TABLE_NAME} at {gmt5_time.strftime('%I:%M %p')} GMT+5")
            return True
        else:
            print(f"[{datetime.now()}] ✗ Failed to open short position for {coin}: {resp.status_code} {resp.text}")
            return False
    except Exception as e:
        print(f"[{datetime.now()}] Error opening short position for {coin}: {e}")
        return False


def add_extra_to_position(coin: str) -> bool:
    """Add extra USD to an existing open position via the /manage API."""
    try:
        url = f"{API_BASE_URL}/manage/{coin}"
        payload = {
            "Action": "Extra",
            "positionSize": POSITION_SIZE,
        }
        params = {"tableName": TABLE_NAME}
        resp = requests.post(url, json=payload, params=params, timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            side = data.get("side", "Unknown")
            print(f"[{datetime.now()}] ✓ Added extra ${POSITION_SIZE} to {side} position for {coin} in {TABLE_NAME}")
            return True
        else:
            print(f"[{datetime.now()}] ✗ Failed to add extra to position for {coin}: {resp.status_code} {resp.text}")
            return False
    except Exception as e:
        print(f"[{datetime.now()}] Error adding extra to position for {coin}: {e}")
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
    global used, state
    try:
        # Initialize state for this coin if not exists
        if coin not in state:
            state[coin] = None
        
        # Check database for existing positions and sync state
        long_exists = check_long_position_exists(coin)
        short_exists = check_short_position_exists(coin)
        
        if long_exists:
            state[coin] = "long"
            print(f"[{datetime.now()}] {coin}: Detected active LONG position in database, state updated.")
        elif short_exists:
            state[coin] = "short"
            print(f"[{datetime.now()}] {coin}: Detected active SHORT position in database, state updated.")
        
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
        cup_id_counter = 0
        current_fill = 0.0
        cup_open_price = None
        cup_close_price = None
        cup_start_date = None
        cup_end_date = None
        handoff_price = None  # Track price when transitioning between cups

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
                    # Use handoff price from previous cup, or candle's open if first cup
                    cup_open_price = handoff_price if handoff_price is not None else o
                    cup_start_date = ts
                    handoff_price = None  # Reset after using

                if capacity_left <= 0:
                    # Cup is completing - set end timestamp to current candle
                    cups.append({
                        "id": cup_id_counter,
                        "fill": current_fill,
                        "open": cup_open_price,
                        "close": cup_close_price,
                        "date": cup_start_date,
                        "end_date": ts,  # Use current timestamp as end time
                    })
                    cup_id_counter += 1
                    # Save the close price as handoff for next cup
                    handoff_price = cup_close_price
                    current_fill = 0.0
                    cup_open_price = None
                    cup_close_price = None
                    cup_start_date = None
                    cup_end_date = None
                    continue

                delta = min(abs(remaining), capacity_left)
                delta *= np.sign(remaining)
                current_fill += delta
                remaining -= delta
                cup_close_price = c
                cup_end_date = ts

                if current_fill == 0:
                    # Cup cancelled out - save close price as handoff
                    handoff_price = cup_close_price
                    cup_open_price = None
                    cup_close_price = None
                    cup_start_date = None
                    cup_end_date = None
                    break

        complete_cups = [cup for cup in cups if abs(cup["fill"]) >= CUP_SIZE_PCT]
        
        # Check position based on latest complete cup
        if complete_cups:
            latest_cup = complete_cups[-1]
            cup_id = latest_cup["id"]
            cup_fill = latest_cup["fill"]
            is_green_cup = cup_fill > 0  # Green = bullish (positive fill)
            
            # Initialize tracking for this cup if not exists
            if cup_id not in used:
                used[cup_id] = False
            
            # Only attempt to open if we don't a2 lready have an active position of opposite or same side
            if is_green_cup:
                print(f"[{datetime.now()}] {coin}: Latest complete cup ID={cup_id} is GREEN (bullish), fill={cup_fill:.5f}")
                
                # Check if we already have an active short position
                if state[coin] == "short":
                    # We have an active short, check if this cup is new (unused)
                    if not used[cup_id]:
                        print(f"[{datetime.now()}] {coin}: Cup {cup_id} matches active short state, adding extra...")
                        if add_extra_to_position(coin):
                            used[cup_id] = True
                    else:
                        print(f"[{datetime.now()}] {coin}: Already have active short trade from previous cycle, skipping.")
                else:
                    print(f"[{datetime.now()}] {coin}: Opening short position with cup {cup_id}...")
                    if open_short_position(coin):
                        used[cup_id] = True
                        state[coin] = "short"
            else:
                print(f"[{datetime.now()}] {coin}: Latest complete cup ID={cup_id} is RED (bearish), fill={cup_fill:.5f}")
                
                # Check if we already have an active long position
                if state[coin] == "long":
                    # We have an active long, check if this cup is new (unused)
                    if not used[cup_id]:
                        print(f"[{datetime.now()}] {coin}: Cup {cup_id} matches active long state, adding extra...")
                        if add_extra_to_position(coin):
                            used[cup_id] = True
                    else:
                        print(f"[{datetime.now()}] {coin}: Already have active long trade from previous cycle, skipping.")
                else:
                    print(f"[{datetime.now()}] {coin}: Opening long position with cup {cup_id}...")
                    if open_long_position(coin):
                        used[cup_id] = True
                        state[coin] = "long"
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
                end_date = cup.get("end_date")
                cup_id = cup["id"]

                r = rows - 1 - i // COLS
                c = i % COLS

                intensity = min(abs(fill) / CUP_SIZE_PCT, 1.0)
                color = (0.0, intensity, 0.0) if fill > 0 else (intensity, 0.0, 0.0)

                ax.add_patch(plt.Rectangle((c, r), 1, 1, color=color))

                if o_price is not None and c_price is not None and date is not None:
                    # Convert to GMT+5 for display
                    gmt5_open = date + timedelta(hours=5)
                    if end_date is not None:
                        gmt5_close = end_date + timedelta(hours=5)
                        close_time_str = gmt5_close.strftime('%I:%M %p')
                    else:
                        close_time_str = "N/A"
                    ax.text(
                        c + 0.5,
                        r + 0.5,
                        f"ID:{cup_id}\n{gmt5_open.strftime('%d-%b').lstrip('0')}\nO:{gmt5_open.strftime('%I:%M %p')}\nC:{close_time_str}\n{o_price:.5f}\n{c_price:.5f}",
                        ha="center",
                        va="center",
                        fontsize=5,
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
        next_min = ((mins // 15) + 1) * 15 # 15 mins
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
