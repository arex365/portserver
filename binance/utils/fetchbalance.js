// utils/fetchBalance.js
const ccxt = require('ccxt');
const config = require('./config.json');

/**
 * Fetches the free USDT balance from Binance Futures.
 * Returns a number, not a string.
 */
async function getUsdtFuturesBalanceNumber(index = 0) {
    try {
        const exchange = new ccxt.binance({
            apiKey: config[index].APIKEY,
            secret: config[index].SECRET,
            enableRateLimit: true,
            options: { defaultType: 'future' }
        });

        const balance = await exchange.fetchBalance();

        // Get free USDT, default to 0 if missing
        const free = balance.USDT?.free ?? 0;

        // Return numeric value (2 decimals)
        return parseFloat(free.toFixed(2));

    } catch (err) {
        console.error('Error fetching USDT futures balance:', err);
        return 0; // return 0 for calculations if error occurs
    }
}

module.exports = { getUsdtFuturesBalanceNumber };
