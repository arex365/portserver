const router = require('express').Router();
const axios = require('axios');
const { getSignedHeader, getBaseUrl } = require('../utils/signature');
const { getCurrentPositions } = require('../utils/checkposition');
const config = require('../config.json');

router.get('/closeShort/:coin', async (req, res) => {
  const index = Number(req.params.index || req.query.index) || 0;
  try {
    const symbol = `${req.params.coin}${config[index].QUOTE_ASSET}`;
    const baseUrl = getBaseUrl(index);
    let orderEndPoint = config[index].PAPI ? "/papi/v1/um/order" : '/fapi/v1/order'

    console.log(`\n=== Closing SHORT position for ${symbol} ===`);

    // Get current positions
    const positions = await getCurrentPositions(symbol, index);

    if (positions.length === 0) {
      return res.json({
        error: "No positions found",
        symbol: symbol
      });
    }

    // Find SHORT position (negative positionAmt)
    const shortPosition = positions.find(p => parseFloat(p.positionAmt) < 0);

    if (!shortPosition) {
      return res.status(400).json({
        error: "No SHORT position found",
        symbol: symbol,
        positions: positions
      });
    }

    const positionAmt = Math.abs(parseFloat(shortPosition.positionAmt));

    console.log(`Found SHORT position: ${shortPosition.positionAmt}`);
    console.log(`Closing with BUY order for ${positionAmt}`);

    // Close SHORT position with BUY order
    const closeParams = {
      symbol,
      side: 'BUY',
      positionSide: 'SHORT',
      type: 'MARKET',
      quantity: positionAmt.toString()
    };

    console.log(`Sending close order:`, closeParams);

    const { headers, queryString } = getSignedHeader('POST',orderEndPoint, closeParams, index);

    const response = await axios.post(`${baseUrl}${orderEndPoint}?${queryString}`, {}, { headers });

    console.log(`✅ Successfully closed SHORT position! Order ID: ${response.data.orderId}`);

    res.send({
      success: true,
      binanceResponse: response.data,
      closeDetails: {
        symbol,
        side: 'BUY',
        positionSide: 'SHORT',
        quantity: positionAmt.toString(),
        positionClosed: shortPosition
      }
    });

  } catch (err) {
    console.error('CloseShort error:', err.response?.data || err.message);
    res.send(err.response?.data || { error: err.message });
  }
});

module.exports = router;
