const router = require("express").Router();
const { getCollection, getDB } = require("../utils/database");
const ccxt = require("ccxt");
const axios = require("axios");
const { ManageSubscriptions } = require("../utils/subscriptionManagement");
const { safePost } = require("../utils/safePost");

// Initialize Binance exchange (use Binance for price fetching)
const exchange = new ccxt.binance({
  enableRateLimit: true,
  options: {
    defaultType: "future",
  },
});

// Helper: get latest price for a symbol. Try CCXT first; if it fails, fall back to Binance Futures REST API.
async function fetchPriceFor(symbol) {
  const sym = symbol.toUpperCase();
  try {
    const ticker = await exchange.fetchTicker(`${sym}/USDT`);
    if (ticker && typeof ticker.last !== "undefined")
      return Number(ticker.last);
  } catch (err) {
    console.warn(
      "ccxt fetchTicker failed, falling back to REST API:",
      err.message || err
    );
  }

  // Fallback to Binance public REST ticker endpoint (perpetual futures)
  try {
    const symbol_formatted = `${sym}USDT`;
    const url = `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol_formatted}`;
    const resp = await axios.get(url, { timeout: 5000 });
    if (resp && resp.data && typeof resp.data.price !== "undefined") {
      return Number(resp.data.price);
    }
    throw new Error("Invalid response from Binance REST API");
  } catch (err) {
    console.error(
      "Failed to fetch price from Binance REST API:",
      err.message || err
    );
    throw err;
  }
}

const FEE_RATE = 0.0002; // Binance futures taker fee is 0.02%, adjust as needed

// Helper function to calculate current profit for a position
function calculateCurrentProfit(position, currentPrice) {
  const quantity = position.positionSize / position.entryPrice;
  let grossPnl = 0;

  if (position.positionSide === "Long") {
    grossPnl = (currentPrice - position.entryPrice) * quantity;
  } else {
    grossPnl = (position.entryPrice - currentPrice) * quantity;
  }

  const feeEntry = position.positionSize * FEE_RATE; // Entry fee only for current profit
  return grossPnl - feeEntry;
}

// Helper function to fetch historical candles from Binance
async function fetchHistoricalCandles(symbol, startTime, endTime) {
  try {
    const sym = symbol.toUpperCase();
    const symbolFormatted = `${sym}USDT`;

    // Binance API expects milliseconds, but we have seconds
    const startMs = startTime * 1000;
    const endMs = endTime * 1000;

    const url = `https://fapi.binance.com/fapi/v1/klines`;
    const params = {
      symbol: symbolFormatted,
      interval: "15m",
      startTime: startMs,
      endTime: endMs,
      limit: 1000, // Max limit per request
    };

    const resp = await axios.get(url, {
      params,
      timeout: 10000,
    });

    if (resp && resp.data && Array.isArray(resp.data)) {
      // Binance klines format: [timestamp, open, high, low, close, volume, ...]
      return resp.data.map((candle) => ({
        timestamp: parseInt(candle[0]) / 1000, // Convert to seconds
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
      }));
    }

    throw new Error("Invalid response from Binance klines API");
  } catch (err) {
    console.error("Failed to fetch historical candles:", err.message || err);
    throw err;
  }
}

// Helper function to calculate min/max profit from historical candles
function calculateMinMaxProfitFromCandles(position, candles) {
  if (!candles || candles.length === 0) {
    return { maxProfit: 0, minProfit: 0, maxProfitTime: null, minProfitTime: null };
  }

  const quantity = position.positionSize / position.entryPrice;
  const feeEntry = position.positionSize * FEE_RATE; // Entry fee
  let maxProfit = 0;
  let minProfit = 0;
  let maxProfitTime = null;
  let minProfitTime = null;

  candles.forEach((candle) => {
    // Check both high and low prices for each candle
    const prices = [
      { price: candle.high, timestamp: candle.timestamp },
      { price: candle.low, timestamp: candle.timestamp },
      { price: candle.open, timestamp: candle.timestamp },
      { price: candle.close, timestamp: candle.timestamp }
    ];

    prices.forEach((priceData) => {
      let grossPnl = 0;

      if (position.positionSide === "Long") {
        grossPnl = (priceData.price - position.entryPrice) * quantity;
      } else {
        grossPnl = (position.entryPrice - priceData.price) * quantity;
      }

      const netProfit = grossPnl - feeEntry;
      
      if (netProfit > maxProfit) {
        maxProfit = netProfit;
        maxProfitTime = priceData.timestamp;
      }
      if (netProfit < minProfit) {
        minProfit = netProfit;
        minProfitTime = priceData.timestamp;
      }
    });
  });

  return { maxProfit, minProfit, maxProfitTime, minProfitTime };
}

router.post("/manage/:coinName", async (req, res) => {
  try {
    let { Action } = req.body;
    let { coinName } = req.params;
    let { positionSize } = req.body; // Position size in USD
    let collectionName = req.query.tableName || "positions";
    // Validate collectionName (allow only letters, numbers, underscore)
    if (!/^[A-Za-z0-9_]+$/.test(collectionName)) collectionName = "positions";

    const collection = getCollection(collectionName);
    const entryTime = Math.floor(Date.now() / 1000); // UNIX epoch time

    if (Action == "Long") {
     // check th position count first and do nothing if positions are already open
      const openLongCount = await collection.countDocuments({
        coinName,
        positionSide: "Long",
        status: "open",
      });
      if (openLongCount > 0) {
        return res.status(400).json({ message: "Long position already open for this coin" });
      }
      // if there is short opened close it first (use request)
      await safePost(`https://trade.itsarex.com/manage/${coinName}?tableName=${collectionName}`, {
        Action: "CloseShort"
      });


      // Get current price from Binance (ccxt first, then REST fallback)
      const entryPrice = await fetchPriceFor(coinName);

      // Insert open Long position
      const result = await collection.insertOne({
        entryTime,
        exitTime: 0,
        coinName,
        positionSide: "Long",
        positionSize,
        entryPrice,
        exitPrice: null,
        status: "open",
        grossPnl: null,
        fee: 0,
        pnl: null,
        maxProfit: 0,
        minProfit: 0,
        maxProfitTime: null,
        minProfitTime: null,
      });

      res.json({
        message: "Long position opened",
        coinName,
        entryPrice,
        positionSize,
        status: "open",
        id: result.insertedId,
      });
      await ManageSubscriptions(collectionName,coinName,"Long");
    } else if (Action == "Short") {
      // check th position count first and do nothing if positions are already open
      const openShortCount = await collection.countDocuments({
        coinName,
        positionSide: "Short",
        status: "open",
      });
      if (openShortCount > 0) {
        return res.status(400).json({ message: "Short position already open for this coin" });
      }
      // if there is long opened close it first (use request)
      await safePost(`https://trade.itsarex.com/manage/${coinName}?tableName=${collectionName}`, {
        Action: "CloseLong"
      });
      // Get current price from Binance (ccxt first, then REST fallback)
      const entryPrice = await fetchPriceFor(coinName);

      // Insert open Short position
      const result = await collection.insertOne({
        entryTime,
        exitTime: 0,
        coinName,
        positionSide: "Short",
        positionSize,
        entryPrice,
        exitPrice: null,
        status: "open",
        grossPnl: null,
        fee: 0,
        pnl: null,
        maxProfit: 0,
        minProfit: 0,
        maxProfitTime: null,
        minProfitTime: null,
      });

      res.json({
        message: "Short position opened",
        coinName,
        entryPrice,
        positionSize,
        status: "open",
        id: result.insertedId,
      });
      await ManageSubscriptions(collectionName,coinName,"Short");
    } else if (Action == "CloseLong") {
      // Get current price from Binance (ccxt first, then REST fallback)
      const exitPrice = await fetchPriceFor(coinName);
      const exitTime = Math.floor(Date.now() / 1000); // UNIX epoch time

      // Get all open Long positions for this coin
      const positions = await collection
        .find({
          coinName,
          positionSide: "Long",
          status: "open",
        })
        .toArray();

      if (!positions || positions.length === 0) {
        return res
          .status(200)
          .json({ message: "No open Long positions found" });
      }

      // Update all open Long positions
      const closedPositions = [];
      for (const position of positions) {
        const entryPrice = position.entryPrice;
        const positionSize = position.positionSize;

        // Calculate PnL for Long: (exitPrice - entryPrice) * quantity
        // quantity = positionSize / entryPrice
        const quantity = positionSize / entryPrice;
        const grossPnl = (exitPrice - entryPrice) * quantity;
        const fee = positionSize * FEE_RATE * 2; // Entry and exit fees
        const pnl = grossPnl - fee;

        // Calculate min/max profit from historical candles between entry and exit
        let maxProfit = 0;
        let minProfit = 0;

        try {
          const candles = await fetchHistoricalCandles(
            coinName,
            position.entryTime,
            exitTime
          );
          const profitExtremes = calculateMinMaxProfitFromCandles(
            position,
            candles
          );
          maxProfit = profitExtremes.maxProfit;
          minProfit = profitExtremes.minProfit;

          // Also consider the exit price profit
          const exitProfit = calculateCurrentProfit(position, exitPrice);
          maxProfit = Math.max(maxProfit, exitProfit);
          minProfit = Math.min(minProfit, exitProfit);

          console.log(
            `Position ${position._id}: Analyzed ${
              candles.length
            } candles, maxProfit: ${maxProfit.toFixed(
              2
            )}, minProfit: ${minProfit.toFixed(2)}`
          );
        } catch (candleErr) {
          console.warn(
            `Failed to fetch candles for ${coinName}, using current profit only:`,
            candleErr.message
          );
          // Fallback to current profit calculation
          const currentProfit = calculateCurrentProfit(position, exitPrice);
          maxProfit = Math.max(position.maxProfit || 0, currentProfit);
          minProfit = Math.min(position.minProfit || 0, currentProfit);
        }

        await collection.updateOne(
          { _id: position._id },
          {
            $set: {
              exitTime,
              exitPrice,
              status: "close",
              grossPnl,
              fee,
              pnl,
              maxProfit,
              minProfit,
              maxProfitTime,
              minProfitTime,
            },
          }
        );

        closedPositions.push({
          id: position._id,
          entryPrice: position.entryPrice,
          exitPrice,
          pnl:
            (exitPrice - position.entryPrice) *
              (position.positionSize / position.entryPrice) -
            position.positionSize * FEE_RATE * 2,
        });
      }

      res.json({
        message: "Long positions closed",
        coinName,
        exitPrice,
        positionsClosed: positions.length,
        closedPositions,
      });
      await ManageSubscriptions(collectionName,coinName,"CloseLong");
    } else if (Action == "CloseShort") {
      // Get current price from Binance (ccxt first, then REST fallback)
      const exitPrice = await fetchPriceFor(coinName);
      const exitTime = Math.floor(Date.now() / 1000); // UNIX epoch time

      // Get all open Short positions for this coin
      const positions = await collection
        .find({
          coinName,
          positionSide: "Short",
          status: "open",
        })
        .toArray();

      if (!positions || positions.length === 0) {
        return res
          .status(200)
          .json({ message: "No open Short positions found" });
      }

      // Update all open Short positions
      const closedPositions = [];
      for (const position of positions) {
        const entryPrice = position.entryPrice;
        const positionSize = position.positionSize;

        // Calculate PnL for Short: (entryPrice - exitPrice) * quantity
        // quantity = positionSize / entryPrice
        const quantity = positionSize / entryPrice;
        const grossPnl = (entryPrice - exitPrice) * quantity;
        const fee = positionSize * FEE_RATE * 2; // Entry and exit fees
        const pnl = grossPnl - fee;

        // Calculate min/max profit from historical candles between entry and exit
        let maxProfit = 0;
        let minProfit = 0;

        try {
          const candles = await fetchHistoricalCandles(
            coinName,
            position.entryTime,
            exitTime
          );
          const profitExtremes = calculateMinMaxProfitFromCandles(
            position,
            candles
          );
          maxProfit = profitExtremes.maxProfit;
          minProfit = profitExtremes.minProfit;

          // Also consider the exit price profit
          const exitProfit = calculateCurrentProfit(position, exitPrice);
          maxProfit = Math.max(maxProfit, exitProfit);
          minProfit = Math.min(minProfit, exitProfit);

          console.log(
            `Position ${position._id}: Analyzed ${
              candles.length
            } candles, maxProfit: ${maxProfit.toFixed(
              2
            )}, minProfit: ${minProfit.toFixed(2)}`
          );
        } catch (candleErr) {
          console.warn(
            `Failed to fetch candles for ${coinName}, using current profit only:`,
            candleErr.message
          );
          // Fallback to current profit calculation
          const currentProfit = calculateCurrentProfit(position, exitPrice);
          maxProfit = Math.max(position.maxProfit || 0, currentProfit);
          minProfit = Math.min(position.minProfit || 0, currentProfit);
        }

        await collection.updateOne(
          { _id: position._id },
          {
            $set: {
              exitTime,
              exitPrice,
              status: "close",
              grossPnl,
              fee,
              pnl,
              maxProfit,
              minProfit,
              maxProfitTime,
              minProfitTime,
            },
          }
        );

        closedPositions.push({
          id: position._id,
          entryPrice: position.entryPrice,
          exitPrice,
          pnl:
            (position.entryPrice - exitPrice) *
              (position.positionSize / position.entryPrice) -
            position.positionSize * FEE_RATE * 2,
        });
      }

      res.json({
        message: "Short positions closed",
        coinName,
        exitPrice,
        positionsClosed: positions.length,
        closedPositions,
      });
      await ManageSubscriptions(collectionName,coinName,"CloseShort");
    } else if (Action === "CloseById" && req.body && req.body.id) {
      const { ObjectId } = require("mongodb");
      let positionId;
      try {
        positionId = new ObjectId(req.body.id);
      } catch (err) {
        return res.status(400).json({ error: "Invalid position ID format" });
      }

      // fetch the position document
      const position = await collection.findOne({ _id: positionId });
      if (!position) {
        return res.status(404).json({ message: "Position not found" });
      }
      ManageSubscriptions(collectionName,position.coinName,"Close");
      try {
        const exitPrice = await fetchPriceFor(position.coinName);
        const exitTime = Math.floor(Date.now() / 1000); // UNIX epoch time
        const entryPrice = position.entryPrice;
        const positionSize = position.positionSize;
        const quantity = positionSize / entryPrice;
        let grossPnl = 0;
        if (position.positionSide === "Long")
          grossPnl = (exitPrice - entryPrice) * quantity;
        else grossPnl = (entryPrice - exitPrice) * quantity;
        const fee = positionSize * FEE_RATE * 2;
        const pnl = grossPnl - fee;

        // Calculate min/max profit from historical candles between entry and exit
        let maxProfit = 0;
        let minProfit = 0;
        let maxProfitTime = null;
        let minProfitTime = null;

        try {
          const candles = await fetchHistoricalCandles(
            position.coinName,
            position.entryTime,
            exitTime
          );
          const profitExtremes = calculateMinMaxProfitFromCandles(
            position,
            candles
          );
          maxProfit = profitExtremes.maxProfit;
          minProfit = profitExtremes.minProfit;
          maxProfitTime = profitExtremes.maxProfitTime;
          minProfitTime = profitExtremes.minProfitTime;

          // Also consider the exit price profit
          const exitProfit = calculateCurrentProfit(position, exitPrice);
          if (exitProfit > maxProfit) {
            maxProfit = exitProfit;
            maxProfitTime = exitTime;
          }
          if (exitProfit < minProfit) {
            minProfit = exitProfit;
            minProfitTime = exitTime;
          }

          console.log(
            `Position ${position._id}: Analyzed ${
              candles.length
            } candles, maxProfit: ${maxProfit.toFixed(
              2
            )}, minProfit: ${minProfit.toFixed(2)}`
          );
        } catch (candleErr) {
          console.warn(
            `Failed to fetch candles for ${position.coinName}, using current profit only:`,
            candleErr.message
          );
          // Fallback to current profit calculation
          const currentProfit = calculateCurrentProfit(position, exitPrice);
          maxProfit = Math.max(position.maxProfit || 0, currentProfit);
          minProfit = Math.min(position.minProfit || 0, currentProfit);
        }

        await collection.updateOne(
          { _id: positionId },
          {
            $set: {
              exitTime,
              exitPrice,
              status: "close",
              grossPnl,
              fee,
              pnl,
              maxProfit,
              minProfit,
              maxProfitTime,
              minProfitTime,
            },
          }
        );

        return res.json({
          message: "Position closed",
          id: positionId,
          exitTime,
          exitPrice,
          grossPnl,
          fee,
          pnl,
          maxProfit,
          minProfit,
          maxProfitTime,
          minProfitTime,
        });
      } catch (fetchErr) {
        console.error(
          "Error fetching price for closeById:",
          fetchErr.message || fetchErr
        );
        return res
          .status(500)
          .json({ error: fetchErr.message || String(fetchErr) });
      }
    } else if (Action === "UpdateProfits") {
      // Update maxProfit and minProfit for open positions based on current prices
      const openPositions = await collection.find({ status: "open" }).toArray();

      if (openPositions.length === 0) {
        return res.json({ message: "No open positions to update" });
      }

      let updatedCount = 0;
      for (const position of openPositions) {
        try {
          const currentPrice = await fetchPriceFor(position.coinName);
          const currentProfit = calculateCurrentProfit(position, currentPrice);
          const currentTime = Math.floor(Date.now() / 1000);

          let maxProfit = position.maxProfit || 0;
          let minProfit = position.minProfit || 0;
          let maxProfitTime = position.maxProfitTime || null;
          let minProfitTime = position.minProfitTime || null;

          let updated = false;
          if (currentProfit > maxProfit) {
            maxProfit = currentProfit;
            maxProfitTime = currentTime;
            updated = true;
          }
          if (currentProfit < minProfit) {
            minProfit = currentProfit;
            minProfitTime = currentTime;
            updated = true;
          }

          // Only update if values changed
          if (updated) {
            await collection.updateOne(
              { _id: position._id },
              { $set: { maxProfit, minProfit, maxProfitTime, minProfitTime } }
            );
            updatedCount++;
          }
        } catch (err) {
          console.warn(
            `Failed to update profits for position ${position._id}:`,
            err.message
          );
        }
      }

      return res.json({
        message: "Profit tracking updated",
        totalPositions: openPositions.length,
        updatedPositions: updatedCount,
      });
    } else if (Action === "RecalculateHistoricalProfits") {
      // Recalculate maxProfit and minProfit for closed positions using historical candles
      const closedPositions = await collection
        .find({
          status: "close",
          entryTime: { $exists: true },
          exitTime: { $exists: true, $ne: 0 },
        })
        .toArray();

      if (closedPositions.length === 0) {
        return res.json({
          message: "No closed positions with valid timestamps found",
        });
      }

      let updatedCount = 0;
      let errorCount = 0;

      for (const position of closedPositions) {
        try {
          const candles = await fetchHistoricalCandles(
            position.coinName,
            position.entryTime,
            position.exitTime
          );
          const profitExtremes = calculateMinMaxProfitFromCandles(
            position,
            candles
          );

          // Also consider the exit price profit
          const exitProfit = calculateCurrentProfit(
            position,
            position.exitPrice
          );
          let maxProfit = profitExtremes.maxProfit;
          let minProfit = profitExtremes.minProfit;
          let maxProfitTime = profitExtremes.maxProfitTime;
          let minProfitTime = profitExtremes.minProfitTime;

          if (exitProfit > maxProfit) {
            maxProfit = exitProfit;
            maxProfitTime = position.exitTime;
          }
          if (exitProfit < minProfit) {
            minProfit = exitProfit;
            minProfitTime = position.exitTime;
          }

          await collection.updateOne(
            { _id: position._id },
            { $set: { maxProfit, minProfit, maxProfitTime, minProfitTime } }
          );

          updatedCount++;
          console.log(
            `Updated position ${position._id}: ${candles.length} candles analyzed`
          );

          // Add small delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (err) {
          console.warn(
            `Failed to recalculate profits for position ${position._id}:`,
            err.message
          );
          errorCount++;
        }
      }

      return res.json({
        message: "Historical profit recalculation completed",
        totalPositions: closedPositions.length,
        updatedPositions: updatedCount,
        errorCount: errorCount,
      });
    } else if (Action === "DeleteById" && req.body && req.body.id) {
      const { ObjectId } = require("mongodb");
      let positionId;
      try {
        positionId = new ObjectId(req.body.id);
      } catch (err) {
        return res.status(400).json({ error: "Invalid position ID format" });
      }

      // Check if position exists
      const position = await collection.findOne({ _id: positionId });
      if (!position) {
        return res.status(404).json({ message: "Position not found" });
      }

      // Delete the position
      const deleteResult = await collection.deleteOne({ _id: positionId });

      if (deleteResult.deletedCount === 1) {
        return res.json({
          message: "Position deleted successfully",
          id: positionId,
          deletedPosition: {
            coinName: position.coinName,
            positionSide: position.positionSide,
            status: position.status,
          },
        });
      } else {
        return res.status(500).json({ error: "Failed to delete position" });
      }
    } else if (Action === "BulkDelete" && req.body && req.body.filter) {
      const filter = req.body.filter;

      // Validate filter to prevent accidental deletion of all data
      if (!filter || Object.keys(filter).length === 0) {
        return res
          .status(400)
          .json({ error: "Filter is required for bulk delete" });
      }

      // Get positions that match the filter first
      const positionsToDelete = await collection.find(filter).toArray();

      if (positionsToDelete.length === 0) {
        return res.json({ message: "No positions found matching the filter" });
      }

      // Delete the positions
      const deleteResult = await collection.deleteMany(filter);

      return res.json({
        message: `Bulk delete completed`,
        deletedCount: deleteResult.deletedCount,
        matchedPositions: positionsToDelete.length,
      });
    } else {
      res.status(400).json({ error: "Invalid Action" });
    }
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// New route to get best performing coins
router.get("/getbest", async (req, res) => {
  try {
    let collectionName = req.query.table || "positions";
    // Validate collectionName (allow only letters, numbers, underscore)
    if (!/^[A-Za-z0-9_]+$/.test(collectionName)) collectionName = "positions";

    const collection = getCollection(collectionName);

    // Get all closed trades
    const closedTrades = await collection.find({ status: "close" }).toArray();

    if (closedTrades.length === 0) {
      return res.json({
        message: "No closed trades found",
        coins: [],
      });
    }

    // Group trades by coin and calculate total PnL for each coin
    const coinPerformance = {};

    closedTrades.forEach((trade) => {
      const coinName = trade.coinName;
      const pnl = trade.pnl || 0;

      if (!coinPerformance[coinName]) {
        coinPerformance[coinName] = {
          coinName: coinName,
          totalPnl: 0,
          tradeCount: 0,
          winCount: 0,
          lossCount: 0,
        };
      }

      coinPerformance[coinName].totalPnl += pnl;
      coinPerformance[coinName].tradeCount += 1;

      if (pnl > 0) {
        coinPerformance[coinName].winCount += 1;
      } else if (pnl < 0) {
        coinPerformance[coinName].lossCount += 1;
      }
    });

    // Convert to array and sort by total PnL (best performing first)
    const sortedCoins = Object.values(coinPerformance)
      .sort((a, b) => b.totalPnl - a.totalPnl)
      .map((coin) => ({
        coinName: coin.coinName,
        totalPnl: Number(coin.totalPnl.toFixed(2)),
        tradeCount: coin.tradeCount,
        winCount: coin.winCount,
        lossCount: coin.lossCount,
        winRate:
          coin.tradeCount > 0
            ? Number(((coin.winCount / coin.tradeCount) * 100).toFixed(2))
            : 0,
      }));

    res.json({
      message: "Best performing coins retrieved successfully",
      tableName: collectionName,
      totalCoins: sortedCoins.length,
      coins: sortedCoins,
    });
  } catch (error) {
    console.error("Error getting best performing coins:", error.message);
    res.status(500).json({ error: error.message });
  }
});



function GetPositionsCount(coinName,tableName,side){
  return router.get(`/getPositionCount/${coinName}/${tableName}?side=${side}`, async (req, res) => {
    try {
      const { coinName, tableName } = req.params;
      const { side } = req.query;
    }
    catch (err) {
      console.error('Error fetching position count:', err);
      return res.status(500).json({ error: 'Error fetching position count' });
    }
  });
}
module.exports = router;
