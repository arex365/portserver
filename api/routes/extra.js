const { getCollection } = require("../utils/database");
const axios = require("axios");
const ccxt = require("ccxt");

// Initialize Binance futures exchange
const exchange = new ccxt.binance({
  enableRateLimit: true,
  options: { defaultType: "future" },
});

// Fetch the current price for a symbol
async function fetchPriceFor(symbol) {
  const sym = symbol.toUpperCase();

  try {
    const ticker = await exchange.fetchTicker(`${sym}/USDT`);
    if (ticker?.last !== undefined) return Number(ticker.last);
  } catch (err) {
    console.warn("ccxt fetchTicker failed, falling back to REST API:", err.message || err);
  }

  // Fallback to Binance REST API
  const url = `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${sym}USDT`;
  const resp = await axios.get(url, { timeout: 5000 });
  if (resp?.data?.price !== undefined) return Number(resp.data.price);

  throw new Error("Failed to fetch price for " + symbol);
}

// Add extra USD to an open position
let addExtra = async (coinName, collectionName, extraUsd = 100) => {
  const collection = getCollection(collectionName);

  // Ensure extraUsd is numeric
  extraUsd = Number(extraUsd);
  if (Number.isNaN(extraUsd) || extraUsd <= 0) {
    throw new Error("extraUsd must be a positive number");
  }

  // Find any open position for this coin (Long or Short)
  const position = await collection.findOne({
    coinName: { $regex: `^${coinName}$`, $options: "i" },
    status: "open",
  });

  if (!position) {
    throw new Error("No open position found for " + coinName);
  }

  // Fetch current market price
  const price = await fetchPriceFor(coinName);

  // Current values
  const oldPositionSize = Number(position.positionSize);
  const oldEntryPrice = Number(position.entryPrice);

  if ([oldPositionSize, oldEntryPrice].some(Number.isNaN)) {
    throw new Error("Corrupted position data (non-numeric values)");
  }

  // Update positionSize (USD) and entryPrice (weighted average)
  const newPositionSize = oldPositionSize + extraUsd;
  const newEntryPrice = (oldEntryPrice * oldPositionSize + price * extraUsd) / newPositionSize;

  // Update in MongoDB
  const result = await collection.updateOne(
    { _id: position._id },
    {
      $set: {
        positionSize: newPositionSize,
        entryPrice: newEntryPrice,
      },
    }
  );

  if (result.matchedCount !== 1) {
    throw new Error("Failed to update position");
  }

  return {
    message: `Added extra to ${position.positionSide} position`,
    coinName,
    side: position.positionSide,
    addedUsd: extraUsd,
    newPositionSize,
    newEntryPrice,
    currentPrice: price,
  };
};

module.exports = addExtra;
