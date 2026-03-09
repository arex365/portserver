const crypto = require('crypto');
const config = require('../config.json');

function getAccountConfig(index = 0) {
  const normalizedIndex = Number.isFinite(Number(index)) ? Number(index) : 0;
  const account = config[normalizedIndex];

  if (!account) {
    throw new Error(`Invalid account index: ${normalizedIndex}`);
  }

  const apiKey = String(account.APIKEY || '').trim();
  const secret = String(account.SECRET || '').trim();

  if (!apiKey || !secret) {
    throw new Error(`Missing API credentials for account index: ${normalizedIndex}`);
  }

  return {
    ...account,
    APIKEY: apiKey,
    SECRET: secret,
    index: normalizedIndex
  };
}

function sign(message, secret) {
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

function getSignedHeader(method, requestPath, body, index = 0) {
  const account = getAccountConfig(index);
  const timestamp = Date.now();
  let queryString = `timestamp=${timestamp}`;
  
  if (body && typeof body === 'object') {
    const bodyParams = Object.keys(body)
      .sort()
      .map(key => `${key}=${encodeURIComponent(body[key])}`)
      .join('&');
    if (bodyParams) {
      queryString += `&${bodyParams}`;
    }
  }

  const signature = sign(queryString, account.SECRET);
  queryString += `&signature=${signature}`;
  
  const headers = {
    'X-MBX-APIKEY': account.APIKEY,
    'Content-Type': 'application/x-www-form-urlencoded'
  };
  
  return { headers, queryString };
}

function getBaseUrl(index = 0) {
  const account = getAccountConfig(index);
  return account.TESTNET ? account.BASE_URL : account.BASE_URL_PROD;
}

module.exports = { getSignedHeader, getBaseUrl, getAccountConfig };