const axios = require('axios');
const { getBaseUrl } = require('./signature');
const config = require('../config.json');

async function getLotSize(coin, index = 0) {
  const quote = (config[index] && config[index].QUOTE_ASSET) || config[0].QUOTE_ASSET;
  const symbol = `${coin}${quote}`;
  const baseUrl = getBaseUrl(index);
  const route = `https://fapi.binance.com/fapi/v1/exchangeInfo`;

  try {
    const response = await axios.get(route);
    const symbolInfo = response.data.symbols.find(s => s.symbol === symbol);

    if (!symbolInfo) {
      throw new Error(`Symbol ${symbol} not found`);
    }

    // Get step size from LOT_SIZE filter
    const lotSizeFilter = symbolInfo.filters.find(f => f.filterType === 'LOT_SIZE');
    if (!lotSizeFilter) {
      throw new Error(`LOT_SIZE filter not found for ${symbol}`);
    }

    return parseFloat(lotSizeFilter.stepSize);
  } catch (error) {
    console.error(`Error getting lot size for ${symbol}:`, error.response?.data || error.message);
    throw error;
  }
}

async function getQuantityPrecision(coin, index = 0) {
  const quote = (config[index] && config[index].QUOTE_ASSET) || config[0].QUOTE_ASSET;
  const symbol = `${coin}${quote}`;
  const baseUrl = getBaseUrl(index);
  const route = `https://fapi.binance.com/fapi/v1/exchangeInfo`;

  try {
    const response = await axios.get(route);
    const symbolInfo = response.data.symbols.find(s => s.symbol === symbol);

    if (!symbolInfo) {
      throw new Error(`Symbol ${symbol} not found`);
    }

    return symbolInfo.quantityPrecision;
  } catch (error) {
    console.error(`Error getting quantity precision for ${symbol}:`, error.response?.data || error.message);
    throw error;
  }
}

function formatQuantity(quantity, precision) {
  return parseFloat(quantity.toFixed(precision));
}

async function getMinNotional(coin, index = 0) {
  const quote = (config[index] && config[index].QUOTE_ASSET) || config[0].QUOTE_ASSET;
  const symbol = `${coin}${quote}`;
  const baseUrl = getBaseUrl(index);
  const route = `https://fapi.binance.com/fapi/v1/exchangeInfo`;

  try {
    const response = await axios.get(route);
    const symbolInfo = response.data.symbols.find(s => s.symbol === symbol);

    if (!symbolInfo) {
      throw new Error(`Symbol ${symbol} not found`);
    }

    // Get min notional from MIN_NOTIONAL filter
    const minNotionalFilter = symbolInfo.filters.find(f => f.filterType === 'MIN_NOTIONAL');
    if (minNotionalFilter) {
      return parseFloat(minNotionalFilter.notional);
    }

    // Fallback to NOTIONAL filter if MIN_NOTIONAL doesn't exist
    const notionalFilter = symbolInfo.filters.find(f => f.filterType === 'NOTIONAL');
    if (notionalFilter) {
      return parseFloat(notionalFilter.minNotional);
    }

    return 5; // Default minimum notional for most Binance futures
  } catch (error) {
    console.error(`Error getting min notional for ${symbol}:`, error.response?.data || error.message);
    return 5; // Default fallback
  }
}

module.exports = { getLotSize, getMinNotional, getQuantityPrecision, formatQuantity };