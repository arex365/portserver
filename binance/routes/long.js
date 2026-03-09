const router = require('express').Router();
const axios = require('axios');
const { getSignedHeader, getBaseUrl, getAccountConfig } = require('../utils/signature');
const { getPrice } = require('../utils/price');
const { getLotSize, getMinNotional, getQuantityPrecision, formatQuantity } = require('../utils/lotsize');
const { closeOppositeIfAny } = require('../utils/checkposition');
const { enforcePositionLimit } = require('../utils/positionLimit');

router.get('/long/:coin/:invest', async (req, res) => {
  try {
    const requestedIndex = req.params.index ?? req.query.index ?? 0;
    const index = Number(requestedIndex);
    const account = getAccountConfig(index);
    const quoteAsset = String(account.QUOTE_ASSET || 'USDT').toUpperCase();
    const normalizedCoin = String(req.params.coin || '').trim().toUpperCase().replace(new RegExp(`${quoteAsset}$`, 'i'), '');
    const symbol = `${normalizedCoin}${quoteAsset}`;
    const margin = parseFloat(req.params.invest);
    const baseUrl = getBaseUrl(index);
    let orderEndPoint = account.PAPI ? "/papi/v1/um/order" : '/fapi/v1/order'
    console.log(`${baseUrl}/${orderEndPoint} is endpoint`)


    if (margin < 1) {
      return res.status(400).json({
        error: "Minimum margin is $1",
        requestedMargin: margin
      });
    }

    const price = await getPrice(normalizedCoin, index);
    const lotSize = await getLotSize(normalizedCoin, index);
    const minNotional = await getMinNotional(normalizedCoin, index);
    const quantityPrecision = await getQuantityPrecision(normalizedCoin, index);

    const notionalValue = margin;
    const rawQty = notionalValue / price;

    let quantity = Math.floor(rawQty / lotSize) * lotSize;

    const positionValue = quantity * price;
    if (positionValue < minNotional) {
      quantity = Math.ceil(minNotional / price / lotSize) * lotSize;
    }

    if (quantity <= 0) {
      quantity = lotSize;
    }

    quantity = formatQuantity(quantity, quantityPrecision);

    let finalPositionValue = quantity * price;

    if (finalPositionValue > notionalValue * 1.1) {
      return res.status(400).json({
        error: "Position size calculation error - position too large",
        details: {
          coin: req.params.coin,
          symbol,
          requestedNotionalValue: notionalValue,
          calculatedPositionValue: finalPositionValue,
          price,
          lotSize,
          calculatedQuantity: quantity,
          minNotional
        }
      });
    }

    console.log(`\n=== Checking for opposite positions before opening LONG ===`);
    const closeResult = await closeOppositeIfAny(symbol, 'LONG', index);
    console.log('Close opposite result:', JSON.stringify(closeResult, null, 2));

    if (closeResult.closed) {
      console.log('Closed opposite position. Waiting...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Keep quantity within Binance max position notional at current leverage.
    let limitCheck = await enforcePositionLimit({
      symbol,
      desiredSide: 'LONG',
      requestedQuantity: quantity,
      price,
      lotSize,
      quantityPrecision,
      index
    });

    if (limitCheck.requiresLeverageChange) {
      const leverageEndpoint = account.PAPI ? '/papi/v1/um/leverage' : '/fapi/v1/leverage';
      const leverageToSet = String(limitCheck.recommendedLeverage);
      const { headers: levHeaders, queryString: levQueryString } = getSignedHeader('POST', leverageEndpoint, {
        symbol,
        leverage: leverageToSet
      }, index);

      await axios.post(`${baseUrl}${leverageEndpoint}?${levQueryString}`, {}, { headers: levHeaders });
      console.log(`Leverage auto-adjusted for ${symbol}: ${limitCheck.leverage} -> ${leverageToSet}`);

      limitCheck = await enforcePositionLimit({
        symbol,
        desiredSide: 'LONG',
        requestedQuantity: quantity,
        price,
        lotSize,
        quantityPrecision,
        index
      });
    }

    if (limitCheck.capped) {
      quantity = limitCheck.quantity;
      finalPositionValue = quantity * price;
      console.log(`Quantity capped by position limit: requested=${limitCheck.requestedQuantity}, allowed=${limitCheck.maxAllowedQuantity}, leverage=${limitCheck.leverage}`);
    }

    if (quantity <= 0) {
      return res.status(400).json({
        error: 'Position blocked by Binance leverage bracket limit.',
        details: {
          symbol,
          requestedNotionalValue: notionalValue,
          maxNotionalValue: limitCheck.maxNotionalValue,
          availableNotional: limitCheck.availableNotional,
          leverage: limitCheck.leverage
        }
      });
    }

    const { headers, queryString } = getSignedHeader('POST', orderEndPoint, {
      symbol,
      side: 'BUY',
      positionSide: 'LONG',
      type: 'MARKET',
      quantity: quantity.toString()
    }, index);
    console.log(`query string : ${baseUrl}${orderEndPoint}?${queryString}`)

    const response = await axios.post(`${baseUrl}${orderEndPoint}?${queryString}`, {}, { headers });

    // Return entry order details only
    res.send({
      success: true,
      entryOrder: response.data,
      orderDetails: {
        symbol,
        side: 'BUY',
        positionSide: 'LONG',
        quantity: quantity.toString(),
        estimatedValue: finalPositionValue,
        notionalValue: notionalValue
      }
    });

  } catch (err) {
    console.error('Long order error:', err.response?.data || err.message);
    const code = err.response?.data?.code;
    if (code === -2014 || code === -2015) {
      return res.status(401).send({
        error: 'Binance API credentials are invalid or not permitted for this account/index.',
        details: err.response?.data
      });
    }
    if (code === -2027) {
      return res.status(400).send({
        error: 'Exceeded Binance maximum allowable position for current leverage.',
        hint: 'Lower leverage using /lever/:coin/:amount or reduce order size.',
        details: err.response?.data
      });
    }
    res.status(400).send(err.response?.data || { error: err.message });
  }
});

module.exports = router;
