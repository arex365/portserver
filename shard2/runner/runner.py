import ccxt
from datetime import datetime
import pandas as pd

# Initialize exchange (using Binance as example)
exchange = ccxt.binance({
    'enableRateLimit': True,
    'options': {'defaultType': 'spot'}
})

# Define parameters
symbol = 'ICP/USDT'  # Change to your desired symbol
timeframe = '1h'      # 1-hour candles (can change to '1m', '4h', '1d', etc.)
since = exchange.parse8601('2026-01-01T00:00:00Z')

# Fetch candles
print(f"Fetching {symbol} candles from January 1st, 2026...")
all_candles = []

try:
    while True:
        candles = exchange.fetch_ohlcv(symbol, timeframe, since=since, limit=1000)
        
        if not candles:
            break
        
        all_candles.extend(candles)
        print(f"Fetched {len(candles)} candles, total: {len(all_candles)}")
        
        since = candles[-1][0] + 1  # Move to next batch
        
        # Stop if we reach today
        if since > exchange.milliseconds():
            break

except ccxt.ExchangeError as e:
    print(f"Exchange error: {e}")
except Exception as e:
    print(f"Error: {e}")

# Convert to DataFrame
df = pd.DataFrame(
    all_candles,
    columns=['timestamp', 'open', 'high', 'low', 'close', 'volume']
)

# Convert timestamp to datetime
df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
df['date'] = df['timestamp'].dt.date

# Separate into red and green candles
red_candles = []
green_candles = []

# Classify candles
for _, row in df.iterrows():
    candle = {
        'timestamp': row['timestamp'],
        'date': row['date'],
        'open': row['open'],
        'high': row['high'],
        'low': row['low'],
        'close': row['close'],
        'volume': row['volume']
    }
    
    if row['close'] >= row['open']:
        green_candles.append(candle)
    else:
        red_candles.append(candle)

print(f"\nTotal candles fetched: {len(df)}")
print(f"Green candles (bullish): {len(green_candles)}")
print(f"Red candles (bearish): {len(red_candles)}")

# Calculate net size % for each array
green_size_total = 0
for candle in green_candles:
    size_pct = ((candle['close'] - candle['open']) / candle['open']) * 100
    green_size_total += size_pct

red_size_total = 0
for candle in red_candles:
    size_pct = ((candle['close'] - candle['open']) / candle['open']) * 100
    red_size_total += size_pct

print(f"\nNet green size %: {green_size_total:.2f}%")
print(f"Net red size %: {red_size_total:.2f}%")

# Calculate and print ratio
if red_size_total != 0:
    ratio = abs(green_size_total / red_size_total)
    print(f"\nRatio G:R = {ratio:.2f}")
else:
    print(f"\nRatio G:R = infinite (no red candles)")
print(f"\nFirst candle:")
print(df.head(1))
print(f"\nLast candle:")
print(df.tail(1))

# Optional: Save to CSV
df.to_csv('candles.csv', index=False)
print("\nCandles saved to 'candles.csv'")
