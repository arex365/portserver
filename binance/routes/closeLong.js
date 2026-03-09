const router = require('express').Router();
const axios = require('axios');
const { getSignedHeader, getBaseUrl } = require('../utils/signature');
const { getCurrentPositions } = require('../utils/checkposition');
const config = require('../config.json');

router.get('/closeLong/:coin', async (req, res) => {
  const index = Number(req.params.index || req.query.index) || 0;
  console.log("attempting long")
  try {
    const symbol = `${req.params.coin}${config[index].QUOTE_ASSET}`;
    const baseUrl = getBaseUrl(index);
    console.log(`\n=== Closing LONG position for ${symbol} ===`);

    // Get current positions
    const positions = await getCurrentPositions(symbol, index);
    if (positions.length === 0) {
      return res.json({
        error: "No positions found",
        symbol: symbol
      });
    }

    // Find LONG position (positive positionAmt)
    const longPosition = positions.find(p => parseFloat(p.positionAmt) > 0);

    if (!longPosition) {
      return res.status(400).json({
        error: "No LONG position found",
        symbol: symbol,
        positions: positions
      });
    }

    const positionAmt = Math.abs(parseFloat(longPosition.positionAmt));

    console.log(`Found LONG position: ${longPosition.positionAmt}`);
    console.log(`Closing with SELL order for ${positionAmt}`);

    // Close LONG position with SELL order
    const closeParams = {
      symbol,
      side: 'SELL',
      positionSide: 'LONG',
      type: 'MARKET',
      quantity: positionAmt.toString()
    };

    console.log(`Sending close order:`, closeParams);

    const { headers, queryString } = getSignedHeader('POST', '/fapi/v1/order', closeParams, index);

    const response = await axios.post(`${baseUrl}/fapi/v1/order?${queryString}`, {}, { headers });

    console.log(`✅ Successfully closed LONG position! Order ID: ${response.data.orderId}`);

    res.send({
      success: true,
      binanceResponse: response.data,
      closeDetails: {
        symbol,
        side: 'SELL',
        positionSide: 'LONG',
        quantity: positionAmt.toString(),
        positionClosed: longPosition
      }
    });

  } catch (err) {
    console.error('CloseLong error:', err.response?.data || err.message);
    res.send(err.response?.data || { error: err.message });
  }
});

module.exports = router;
