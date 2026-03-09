const router = require('express').Router();
const axios = require('axios');
const { getSignedHeader, getBaseUrl } = require('../utils/signature');
const { getPrice } = require('../utils/price');
const { getLotSize, getMinNotional } = require('../utils/lotsize');
const { setPositionMode, getPositionMode } = require('../utils/positionMode');
const config = require('../config.json');

router.get('/simple-long/:coin/:invest', async (req, res) => {
  try {
    const index = Number(req.params.index || req.query.index) || 0;
    const symbol = `${req.params.coin}${config[index].QUOTE_ASSET}`;
    const margin = parseFloat(req.params.invest);
    const baseUrl = getBaseUrl(index);
    
    // Minimum $1 margin check
    if (margin < 1) {
      return res.status(400).json({
        error: "Minimum margin is $1",
        requestedMargin: margin
      });
    }

    const price = await getPrice(req.params.coin, index);
    const lotSize = await getLotSize(req.params.coin, index);
    const minNotional = await getMinNotional(req.params.coin, index);

    // Default leverage = 10
    const leverage = 10;
    const rawQty = (margin * leverage) / price;

    // Adjust to nearest lot size
    let quantity = Math.floor(rawQty / lotSize) * lotSize;

    // Ensure minimum notional value is met
    const notionalValue = quantity * price;
    if (notionalValue < minNotional) {
      quantity = Math.ceil(minNotional / price / lotSize) * lotSize;
    }

    // If still zero, set minimum lot size
    if (quantity <= 0) {
      quantity = lotSize;
    }

    // Calculate the USDC value of this position
    const positionValue = quantity * price;

    // Set position mode to one-way (simpler)
    try {
      const currentMode = await getPositionMode();
      console.log('Current position mode:', currentMode.mode);
      
      if (currentMode.dualSidePosition) {
        console.log('Setting position mode to One-way Mode...');
        const setModeResult = await setPositionMode(false);
        console.log('Position mode set:', setModeResult.mode);
      }
    } catch (err) {
      console.log('Error with position mode:', err.response?.data || err.message);
    }

    console.log(`Symbol: ${symbol}`);
    console.log(`Price: ${price}, LotSize: ${lotSize}, MinNotional: ${minNotional}`);
    console.log(`RawQty: ${rawQty}, Final Quantity: ${quantity}`);
    console.log(`Position Value (${config[index].QUOTE_ASSET}): ${positionValue}`);
    console.log(`Requested Margin: ${margin}`);

    // Simple order without position side (one-way mode)
    const { headers, queryString } = getSignedHeader('POST', '/fapi/v1/order', {
      symbol,
      side: 'BUY',
      type: 'MARKET',
      quantity: quantity.toString()
    }, index);
    
    const response = await axios.post(`${baseUrl}/fapi/v1/order?${queryString}`, {}, { headers });
    
    res.send({
      success: true,
      binanceResponse: response.data,
      orderDetails: {
        symbol,
        side: 'BUY',
        type: 'MARKET',
        quantity: quantity.toString(),
        estimatedValue: positionValue,
        margin: margin,
        leverage: leverage,
        mode: 'One-way (no position sides)'
      }
    });

  } catch (err) {
    console.error('Simple long order error:', err.response?.data || err.message);
    res.status(400).send(err.response?.data || { error: err.message });
  }
});

module.exports = router;