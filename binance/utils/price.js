const axios = require('axios');
const { getBaseUrl } = require('./signature');
const config = require('../config.json');

async function getPrice(coin, index = 0) {
  const quote = (config[index] && config[index].QUOTE_ASSET) || config[0].QUOTE_ASSET;
  const symbol = `${coin}${quote}`;
  const baseUrl = getBaseUrl(index);
  const route = `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`;
  
  try {
    const response = await axios.get(route);
    return parseFloat(response.data.price);
  } catch (error) {
    console.error(`Error getting price for ${symbol}:`, error.response?.data || error.message);
    throw error;
  }
}

module.exports = { getPrice };