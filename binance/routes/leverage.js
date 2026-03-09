const router = require('express').Router();
const axios = require('axios');
const { getSignedHeader, getBaseUrl } = require('../utils/signature');
const { getPrice } = require('../utils/price');
const config = require('../config.json');

router.get('/lever/:coin/:amount', async (req, res) => {
  try {
    const index = Number(req.params.index || req.query.index) || 0;
    const symbol = `${req.params.coin}${config[index].QUOTE_ASSET}`;
    const leverage = parseInt(req.params.amount);
    const baseUrl = getBaseUrl(index);
    
    // Set leverage for both LONG and SHORT positions
    const { headers, queryString } = getSignedHeader('POST', '/fapi/v1/leverage', {
      symbol,
      leverage: leverage.toString()
    }, index);
    
    const response = await axios.post(`${baseUrl}/fapi/v1/leverage?${queryString}`, {}, { headers });
    
    const price = await getPrice(req.params.coin, index);
    console.log(`Price for ${symbol}: ${price}`);
    
    res.send({
      success: true,
      symbol,
      leverage,
      price,
      response: response.data
    });
    
  } catch (err) {
    console.error('Leverage error:', err.response?.data || err.message);
    res.status(400).send(err.response?.data || { error: err.message });
  }
});

module.exports = router;