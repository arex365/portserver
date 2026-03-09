const axios = require('axios');
const { getSignedHeader, getBaseUrl, getAccountConfig } = require('./signature');
const { formatQuantity } = require('./lotsize');

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function floorToStep(value, step) {
  if (step <= 0) return value;
  return Math.floor(value / step) * step;
}

function getCurrentSideNotional(positionRisk, desiredSide, price) {
  const positionAmt = toNumber(positionRisk.positionAmt, 0);
  const side = String(positionRisk.positionSide || 'BOTH').toUpperCase();

  if (side === 'BOTH') {
    if (desiredSide === 'LONG') {
      return Math.max(positionAmt, 0) * price;
    }
    return Math.max(-positionAmt, 0) * price;
  }

  return Math.abs(positionAmt) * price;
}

function selectRiskRow(rows, desiredSide) {
  const normalized = Array.isArray(rows) ? rows : [];
  if (normalized.length === 0) return null;

  const exact = normalized.find(r => String(r.positionSide || '').toUpperCase() === desiredSide);
  if (exact) return exact;

  return normalized.find(r => String(r.positionSide || '').toUpperCase() === 'BOTH') || normalized[0];
}

function normalizeBracketPayload(payload, symbol) {
  const list = Array.isArray(payload) ? payload : [payload];
  const upperSymbol = String(symbol || '').toUpperCase();
  return list.find(item => String(item?.symbol || '').toUpperCase() === upperSymbol) || null;
}

function getBracketNotionalCap(brackets, currentLeverage) {
  const cleaned = (Array.isArray(brackets) ? brackets : [])
    .map(b => ({
      initialLeverage: toNumber(b.initialLeverage, 0),
      notionalCap: toNumber(b.notionalCap, 0)
    }))
    .filter(b => b.initialLeverage > 0 && b.notionalCap > 0)
    .sort((a, b) => a.initialLeverage - b.initialLeverage);

  if (cleaned.length === 0) return 0;

  const eligible = cleaned.find(b => currentLeverage <= b.initialLeverage);
  if (eligible) return eligible.notionalCap;

  return cleaned[cleaned.length - 1].notionalCap;
}

async function enforcePositionLimit({
  symbol,
  desiredSide,
  requestedQuantity,
  price,
  lotSize,
  quantityPrecision,
  index = 0
}) {
  const account = getAccountConfig(index);
  const baseUrl = getBaseUrl(index);
  const riskEndpoint = account.PAPI ? '/papi/v1/um/positionRisk' : '/fapi/v2/positionRisk';

  const requestedQty = toNumber(requestedQuantity, 0);
  if (requestedQty <= 0) {
    return {
      quantity: 0,
      capped: false,
      reason: 'non-positive requested quantity'
    };
  }

  const { headers, queryString } = getSignedHeader('GET', riskEndpoint, { symbol }, index);
  const response = await axios.get(`${baseUrl}${riskEndpoint}?${queryString}`, { headers });

  const rows = Array.isArray(response.data)
    ? response.data.filter(r => String(r.symbol || '').toUpperCase() === String(symbol).toUpperCase())
    : [];

  const riskRow = selectRiskRow(rows, desiredSide);
  if (!riskRow) {
    return {
      quantity: requestedQty,
      capped: false,
      reason: 'position risk row not found'
    };
  }

  const currentLeverage = toNumber(riskRow.leverage, 0);
  let maxNotionalValue = toNumber(riskRow.maxNotionalValue, 0);
  let maxSupportedLeverage = 0;

  try {
    const bracketEndpoint = account.PAPI ? '/papi/v1/um/leverageBracket' : '/fapi/v1/leverageBracket';
    const { headers: bHeaders, queryString: bQueryString } = getSignedHeader('GET', bracketEndpoint, { symbol }, index);
    const bracketResp = await axios.get(`${baseUrl}${bracketEndpoint}?${bQueryString}`, { headers: bHeaders });
    const symbolBracket = normalizeBracketPayload(bracketResp.data, symbol);
    const brackets = symbolBracket?.brackets || [];

    maxSupportedLeverage = Math.max(
      0,
      ...brackets.map(b => toNumber(b.initialLeverage, 0))
    );

    if (maxNotionalValue <= 0) {
      const bracketCap = getBracketNotionalCap(brackets, currentLeverage);
      if (bracketCap > 0) {
        maxNotionalValue = bracketCap;
      }
    }
  } catch (error) {
    // If bracket lookup fails, keep fallback behavior and let Binance validate on submit.
  }

  if (maxNotionalValue <= 0) {
    return {
      quantity: requestedQty,
      capped: false,
      reason: 'max notional unavailable',
      leverage: currentLeverage,
      maxSupportedLeverage,
      requiresLeverageChange: maxSupportedLeverage > 0 && currentLeverage > maxSupportedLeverage,
      recommendedLeverage: maxSupportedLeverage > 0 ? maxSupportedLeverage : currentLeverage
    };
  }

  const currentSideNotional = getCurrentSideNotional(riskRow, desiredSide, price);
  const availableNotional = Math.max(maxNotionalValue - currentSideNotional, 0);

  let maxQtyByLimit = availableNotional / price;
  maxQtyByLimit = floorToStep(maxQtyByLimit, lotSize);
  maxQtyByLimit = formatQuantity(maxQtyByLimit, quantityPrecision);

  const finalQty = Math.min(requestedQty, toNumber(maxQtyByLimit, 0));

  return {
    quantity: finalQty,
    capped: finalQty < requestedQty,
    requestedQuantity: requestedQty,
    maxAllowedQuantity: toNumber(maxQtyByLimit, 0),
    maxNotionalValue,
    currentSideNotional,
    availableNotional,
    leverage: currentLeverage,
    positionSide: String(riskRow.positionSide || 'BOTH')
    ,
    maxSupportedLeverage,
    requiresLeverageChange: maxSupportedLeverage > 0 && currentLeverage > maxSupportedLeverage,
    recommendedLeverage: maxSupportedLeverage > 0 ? maxSupportedLeverage : currentLeverage
  };
}

module.exports = { enforcePositionLimit };
