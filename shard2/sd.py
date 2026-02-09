import ccxt
from datetime import datetime
import pandas as pd
import matplotlib.pyplot as plt
import numpy as np

# ======================
# Initialize exchange
# ======================
exchange = ccxt.binance({
    'enableRateLimit': True,
    'options': {'defaultType': 'spot'}
})

# ======================
# Parameters
# ======================
symbol = 'ZEC/USDT'
timeframe = '1h'
since = exchange.parse8601('2026-01-01T00:00:00Z')

print(f"Fetching {symbol} candles from January 1st, 2026...")
all_candles = []

# ======================
# Fetch OHLCV data
# ======================
while True:
    candles = exchange.fetch_ohlcv(symbol, timeframe, since=since, limit=1000)
    if not candles:
        break

    all_candles.extend(candles)
    since = candles[-1][0] + 1

    if since > exchange.milliseconds():
        break

# ======================
# Create DataFrame
# ======================
df = pd.DataFrame(
    all_candles,
    columns=['timestamp', 'open', 'high', 'low', 'close', 'volume']
)

df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
df['date'] = df['timestamp'].dt.date

# ======================
# Candle size %
# ======================
df['size_pct'] = ((df['close'] - df['open']) / df['open']) * 100

df['green_size'] = df['size_pct'].where(df['close'] >= df['open'], 0)
df['red_size'] = df['size_pct'].where(df['close'] < df['open'], 0)

# ======================
# Daily aggregation
# ======================
daily = df.groupby('date').agg({
    'green_size': 'sum',
    'red_size': 'sum',
    'open': 'first',
    'close': 'last'
}).reset_index()

# ======================
# Cumulative sums
# ======================
daily['cum_green'] = daily['green_size'].cumsum()
daily['cum_red'] = daily['red_size'].cumsum().abs()
daily['G_R_ratio'] = daily['cum_green'] / daily['cum_red'].replace(0, np.nan)

# ======================
# Colors
# ======================
# Price bar color: green if close >= open
daily['price_color'] = np.where(daily['close'] >= daily['open'], 'green', 'red')

# G:R bar color: green if rising vs previous day
daily['gr_change'] = daily['G_R_ratio'].diff()
daily['gr_color'] = np.where(daily['gr_change'] >= 0, 'green', 'red')

# ======================
# Plot
# ======================
fig, (ax1, ax2) = plt.subplots(
    2, 1,
    figsize=(14, 8),
    sharex=True,
    gridspec_kw={'height_ratios': [2, 1]}
)

# ---- Price bar chart ----
ax1.bar(
    daily['date'],
    daily['close'],
    color=daily['price_color'],
    width=0.8
)

ax1.set_title(f"{symbol} Price & Cumulative G:R Ratio")
ax1.set_ylabel("Price (USDT)")
ax1.grid(True)

# ---- G:R ratio bar chart ----
ax2.bar(
    daily['date'],
    daily['G_R_ratio'],
    color=daily['gr_color'],
    width=0.8
)

ax2.axhline(1, linestyle='--', color='gray', alpha=0.6)
ax2.set_ylabel("G:R Ratio")
ax2.set_xlabel("Date")
ax2.grid(True)

plt.tight_layout()
plt.show()

# ======================
# Save output
# ======================
daily.to_csv('daily_gr_ratio.csv', index=False)
print("Saved daily G:R ratio to 'daily_gr_ratio.csv'")
