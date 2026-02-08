# =====================
# IMPORTS
# =====================
import ccxt
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from datetime import datetime, timedelta, timezone
import time
import io
import os
from pathlib import Path
import traceback

# =====================
# PARAMETERS
# =====================
TIMEFRAME = "15m"
CUP_SIZE_PCT = 2.0
MONTHS = 1
COLS = 20
LIMIT = 300

# Coins to process
COINS = ["ZEC", "ICP", "ENA"]

# Refresh interval in seconds (3 minutes)
REFRESH_SECONDS = 3 * 60

# =====================
# EXCHANGE SETUP
# =====================
exchange = ccxt.okx({
    "enableRateLimit": True,
})
exchange.load_markets()


def fetch_ohlcv_all(symbol: str):
    since = int((datetime.now(timezone.utc) - timedelta(days=30 * MONTHS)).timestamp() * 1000)
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
        symbol = f"{coin}/USDT:USDT"
        if symbol not in exchange.symbols:
            alt = f"{coin}/USDT"
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
        if not complete_cups:
            print(f"[{datetime.now()}] No complete cups for {symbol}.")
            return

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
                    f"{date.strftime('%-d-%b')}\n{o_price:.2f}\n{c_price:.2f}",
                    ha="center",
                    va="center",
                    fontsize=6,
                    color="white",
                    weight="bold",
                )

        plt.title(f"{symbol} {TIMEFRAME} Bucket-Fill Chart (OKX)", fontsize=14)
        plt.subplots_adjust(left=0.01, right=0.99, top=0.95, bottom=0.01)

        out_path = out_dir / f"{coin}.png"
        plt.savefig(out_path, format="png", dpi=150)
        plt.close(fig)
        print(f"[{datetime.now()}] Saved chart for {coin} -> {out_path}")

    except Exception:
        print(f"[{datetime.now()}] Error processing {coin}:\n" + traceback.format_exc())


def main():
    out_dir = Path(__file__).resolve().parent / "outputs"
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"[{datetime.now()}] Starting bot: coins={COINS}, refresh={REFRESH_SECONDS}s")

    while True:
        start = time.time()
        for coin in COINS:
            process_coin(coin, out_dir)
            time.sleep(max(exchange.rateLimit / 1000, 0.5))

        elapsed = time.time() - start
        to_sleep = max(0, REFRESH_SECONDS - elapsed)
        print(f"[{datetime.now()}] Cycle complete, sleeping {to_sleep:.1f}s")
        time.sleep(to_sleep)


if __name__ == "__main__":
    main()
