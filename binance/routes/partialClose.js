const router = require('express').Router();
const axios = require('axios');
const { getSignedHeader, getBaseUrl } = require('../utils/signature');
const { getCurrentPositions } = require('../utils/checkposition');
const { getPrice } = require('../utils/price');
const { getLotSize, getMinNotional, getQuantityPrecision, formatQuantity } = require('../utils/lotsize');
const config = require('../config.json');

function roundToStep(quantity, stepSize) {
  if (!stepSize || stepSize <= 0) {
    return quantity;
  }
  return Math.floor(quantity / stepSize) * stepSize;
}

router.get('/partialclose/:coin/:perc', async (req, res) => {
  const index = Number(req.params.index || req.query.index) || 0;
  const perc = parseFloat(req.params.perc || req.query.perc);

  if (!Number.isFinite(perc) || perc <= 0 || perc > 100) {
    return res.status(400).json({
      error: 'Invalid percentage. Must be between 0 and 100.',
      perc
    });
  }

  try {
    const symbol = `${req.params.coin}${config[index].QUOTE_ASSET}`;
    const baseUrl = getBaseUrl(index);
    const orderEndPoint = config[index].PAPI ? '/papi/v1/um/order' : '/fapi/v1/order';

    console.log(`\n=== Partial close for ${symbol}: ${perc}% ===`);

    const positions = await getCurrentPositions(symbol, index);
    if (positions.length === 0) {
      return res.json({
        error: 'No positions found',
        symbol
      });
    }

    const longPosition = positions.find(p => parseFloat(p.positionAmt) > 0);
    const shortPosition = positions.find(p => parseFloat(p.positionAmt) < 0);

    if (longPosition && shortPosition) {
      return res.status(400).json({
        error: 'Both LONG and SHORT positions are open. Use a specific close route.',
        symbol,
        positions
      });
    }

    const position = longPosition || shortPosition;
    if (!position) {
      return res.status(400).json({
        error: 'No open position found for symbol',
        symbol,
        positions
      });
    }

    const positionAmt = Math.abs(parseFloat(position.positionAmt));
    const isLong = parseFloat(position.positionAmt) > 0;
    const side = isLong ? 'SELL' : 'BUY';
    const positionSide = position.positionSide || (isLong ? 'LONG' : 'SHORT');

    let targetQty = (perc >= 100) ? positionAmt : (positionAmt * (perc / 100));

    const [stepSize, precision, minNotional, price] = await Promise.all([
      getLotSize(req.params.coin, index),
      getQuantityPrecision(req.params.coin, index),
      getMinNotional(req.params.coin, index),
      getPrice(req.params.coin, index)
    ]);

    targetQty = roundToStep(targetQty, stepSize);
    targetQty = formatQuantity(targetQty, precision);

    if (!Number.isFinite(targetQty) || targetQty <= 0) {
      return res.status(400).json({
        error: 'Calculated quantity is too small after step/precision rounding.',
        symbol,
        perc,
        positionAmt,
        stepSize,
        precision
      });
    }

    const notional = targetQty * price;

    if (notional < minNotional) {
      return res.status(400).json({
        error: 'Notional too small for partial close.',
        symbol,
        perc,
        targetQty,
        price,
        notional,
        minNotional
      });
    }

    console.log(`Found ${positionSide} position: ${position.positionAmt}`);
    console.log(`Partial close with ${side} order for ${targetQty}`);

    const closeParams = {
      symbol,
      side,
      positionSide,
      type: 'MARKET',
      quantity: targetQty.toString()
    };

    console.log('Sending partial close order:', closeParams);

    const { headers, queryString } = getSignedHeader('POST', orderEndPoint, closeParams, index);
    const response = await axios.post(`${baseUrl}${orderEndPoint}?${queryString}`, {}, { headers });

    console.log(`✅ Successfully partially closed position! Order ID: ${response.data.orderId}`);

    res.send({
      success: true,
      binanceResponse: response.data,
      closeDetails: {
        symbol,
        side,
        positionSide,
        quantity: targetQty.toString(),
        percent: perc,
        positionClosed: position
      }
    });
  } catch (err) {
    console.error('PartialClose error:', err.response?.data || err.message);
    res.send(err.response?.data || { error: err.message });
  }
});

module.exports = router;
