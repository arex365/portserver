const router = require('express').Router();
const axios = require('axios');
const ccxt = require('ccxt');
const { logToFile } = require('../utils/logger');

// ?? IMPORT SHARED REDIS CLIENT (NO CONNECTION HERE)
//const redis = require('../utils/redisClient');

const URL = "http://f1.itsarex.com:5503/trade";
const TIMEOUT = 10000;

// ----------------------------
//       HELPERS
// ----------------------------
function normalize(str) {
  return String(str || "").trim().toLowerCase();
}

async function getState(coin) {
  const key = `coinState:${coin}`;
  //const raw = await redis.get(key);

  if (!raw) {
    const state = { Previous: "null", Attempt: 0 };
    //await redis.set(key, JSON.stringify(state));
    return state;
  }

  //return JSON.parse(raw);
return 0
}

async function setState(coin, state) {
  const key = `coinState:${coin}`;
  //await redis.set(key, JSON.stringify(state));
}

async function resetStateIfDirectionChanged(coin, direction) {
  direction = normalize(direction);
  let state = await getState(coin);

  if (state.Previous !== direction) {
    logToFile(`[RESET] ${coin}: ${state.Previous} -> ${direction}`);

    state.Previous = direction;
    state.Attempt = 1;

    await setState(coin, state);
    return true;
  }

  return false;
}

// ----------------------------
//      MAIN ENDPOINT
// ----------------------------
router.post('/manageOrder/:coinName/:invest', async (req, res) => {
  try {
    const real = req.query.real === 'true';
    const ActionRaw = req.body?.Action;
    const Action = normalize(ActionRaw);

    let { coinName, invest } = req.params;

    if (!coinName) {
      return res.status(400).json({ error: "Missing coinName" });
    }

    coinName = coinName.trim();
    invest = Number(invest);

    if (!["long", "short", "closelong", "closeshort"].includes(Action)) {
      return res.status(400).json({
        error: "Invalid action. Must be: Long, Short, CloseLong, CloseShort"
      });
    }

    let state = await getState(coinName);
    let url = "blank";

    logToFile(`\n===== ${coinName} | ACTION: ${Action} | real=${real} =====`);
    logToFile(`Before: ${JSON.stringify(state)}`);

    // ----------------------------
    //          LONG
    // ----------------------------
    if (Action === "long") {
      const changed = await resetStateIfDirectionChanged(coinName, "long");

      state = await getState(coinName);
      if (!changed) state.Attempt++;

      if (state.Attempt >= 3) {
        if (state.Attempt === 3) invest *= 3;

        url = `http://localhost:5502/long/${coinName}/${invest}`;

        if (!real) {
          try {
            await openTheTrade(`${coinName}/USDT`, invest, "long");
          } catch (err) {
            logToFile(`openTheTrade(long) error: ${err.message}`);
          }
        }
      }else{
        invest = 5
        url = `http://localhost:5502/long/${coinName}/${invest}`;
      }

      await setState(coinName, state);
    }

    // ----------------------------
    //          SHORT
    // ----------------------------
    else if (Action === "short") {
      const changed = await resetStateIfDirectionChanged(coinName, "short");

      state = await getState(coinName);
      if (!changed) state.Attempt++;

      if (state.Attempt >= 3) {
        if (state.Attempt === 3) invest *= 3;

        url = `http://localhost:5502/short/${coinName}/${invest}`;

        if (!real) {
          try {
            await openTheTrade(`${coinName}/USDT`, invest, "short");
          } catch (err) {
            logToFile(`openTheTrade(short) error: ${err.message}`);
          }
        }
      }else{
        invest = 5
        url = `http://localhost:5502/short/${coinName}/${invest}`;
      }

      await setState(coinName, state);
    }

    // ----------------------------
    //        CLOSE LONG
    // ----------------------------
    else if (Action === "closelong") {
      if (state.Previous === "long") {
        state.Previous = "null";
        state.Attempt = 0;
        await setState(coinName, state);
        logToFile(`[RESET] ${coinName}: CloseLong reset`);
      }

      url = `http://localhost:5502/closeLong/${coinName}`;

      try {
        await axios.post(
          `http://f1.itsarex.com:5503/CloseLong/${coinName}USDT`,
          {},
          { timeout: TIMEOUT }
        );
      } catch (err) {
        logToFile(`Remote closeLong error: ${err.message}`);
      }
    }

    // ----------------------------
    //        CLOSE SHORT
    // ----------------------------
    else if (Action === "closeshort") {
      if (state.Previous === "short") {
        state.Previous = "null";
        state.Attempt = 0;
        await setState(coinName, state);
        logToFile(`[RESET] ${coinName}: CloseShort reset`);
      }

      url = `http://localhost:5502/closeShort/${coinName}`;

      try {
        await axios.post(
          `http://f1.itsarex.com:5503/CloseShort/${coinName}USDT`,
          {},
          { timeout: TIMEOUT }
        );
      } catch (err) {
        logToFile(`Remote closeShort error: ${err.message}`);
      }
    }

    // ----------------------------
    //      RESPONSE
    // ----------------------------
    logToFile(`After: ${JSON.stringify(await getState(coinName))}`);
    logToFile(`Forwarding to: ${url}`);

    if (url === "blank") {
      return res.json({
        message: "No trade triggered. Attempt < 3",
        state: await getState(coinName)
      });
    }

    if (real) {
      const response = await axios.get(url, { timeout: TIMEOUT });
      return res.send(response.data);
    }

    return res.send("ok");

  } catch (err) {
    logToFile(`manageOrder ERROR: ${err.message}`);
    return res.status(400).json({ error: err.message });
  }
});

// -------------------------------------------------------
//     OPEN TRADE + STOPLOSS/TP CALCULATOR
// -------------------------------------------------------
async function getTradeLevels(symbol, side) {
  const exchange = new ccxt.binance({ options: { defaultType: "future" } });

  const candles = await exchange.fetchOHLCV(symbol, "5m", undefined, 5);
  const prev = candles.slice(0, 4);

  const lows = prev.map(c => c[3]);
  const highs = prev.map(c => c[2]);

  const lowestLow = Math.min(...lows);
  const highestHigh = Math.max(...highs);

  const ticker = await exchange.fetchTicker(symbol);
  const entry = ticker.last;

  let stopLoss, takeProfit;

  if (side === "long") {
    stopLoss = lowestLow;
    takeProfit = entry + (entry - stopLoss) * 2;
  } else {
    stopLoss = highestHigh;
    takeProfit = entry - (stopLoss - entry) * 2;
  }

  return {
    entry_price: entry,
    stop_loss: stopLoss,
    take_profit: takeProfit
  };
}

async function openTheTrade(symbol, amount, side) {
  logToFile(`openTheTrade() symbol=${symbol}, amount=${amount}, side=${side}`);

  try {
    const levels = await getTradeLevels(symbol, side);

    const payload = {
      symbol,
      amount: String(amount),
      entry_price: String(levels.entry_price),
      stop_loss: String(levels.stop_loss),
      take_profit: String(levels.take_profit),
      side
    };

    logToFile(`Sending trade payload: ${JSON.stringify(payload)}`);

    const response = await axios.post(URL, payload, {
      timeout: TIMEOUT,
      headers: { "Content-Type": "application/json" }
    });

    logToFile(`Trade Open Response: ${JSON.stringify(response.data)}`);
    return response.data;

  } catch (err) {
    logToFile(`openTheTrade ERROR: ${err.message}`);
    throw err;
  }
}

module.exports = router;
