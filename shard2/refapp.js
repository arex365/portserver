import ccxt
from datetime import datetime
import pandas as pd
import matplotlib.pyplot as plt

# Initialize exchange
exchange = ccxt.binance({
    'enableRateLimit': True,
    'options': {'defaultType': 'spot'}
})

# Parameters
symbol = 'BTC/USDT'
timeframe = '1h'
since = exchange.parse8601('2025-01-01T00:00:00Z')

print(f"Fetching {symbol} candles from January 1st, 2026...")
all_candles = []

# Fetch OHLCV data
while True:
    candles = exchange.fetch_ohlcv(symbol, timeframe, since=since, limit=1000)
    if not candles:
        break

    all_candles.extend(candles)
    since = candles[-1][0] + 1

    if since > exchange.milliseconds():
        break

# Create DataFrame
df = pd.DataFrame(
    all_candles,
    columns=['timestamp', 'open', 'high', 'low', 'close', 'volume']
)

df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
df['date'] = df['timestamp'].dt.date

# Candle size %
df['size_pct'] = ((df['close'] - df['open']) / df['open']) * 100

# Separate green/red
df['green_size'] = df['size_pct'].where(df['close'] >= df['open'], 0)
df['red_size'] = df['size_pct'].where(df['close'] < df['open'], 0)

# Daily aggregation
daily = df.groupby('date').agg({
    'green_size': 'sum',
    'red_size': 'sum'
}).reset_index()

# Cumulative sums
daily['cum_green'] = daily['green_size'].cumsum()
daily['cum_red'] = daily['red_size'].cumsum().abs()

# G:R ratio
daily['G_R_ratio'] = daily['cum_green'] / daily['cum_red']

# Plot
plt.figure(figsize=(12, 6))
plt.plot(daily['date'], daily['G_R_ratio'], label='G:R Ratio', color='blue')
plt.axhline(1, linestyle='--', color='gray', alpha=0.6)

plt.title(f"Cumulative Green:Red Ratio — {symbol}")
plt.xlabel("Date")
plt.ylabel("G:R Ratio")
plt.legend()
plt.grid(True)
plt.tight_layout()
plt.show()

# Optional save
daily.to_csv('daily_gr_ratio.csv', index=False)
print("Saved daily G:R ratio to 'daily_gr_ratio.csv'")
