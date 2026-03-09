const axios = require('axios');

// Configuration
const TABLE_NAMES = [
  {
    "tableName": "TopRev"
  }  
]; // List of tables to watch
const SERVER_URL = 'https://trade.itsarex.com'; // Local server URL

// Close All Method
async function closeAll() {
  console.log('[Close All] Starting to close all open positions...');

  try {
    for (const tableConfig of TABLE_NAMES) {
      const { tableName } = tableConfig;
      
      // Fetch all open trades from the local server
      const response = await axios.get(`${SERVER_URL}/gettrades`, {
        params: {
          tableName: tableName,
          status: 'open'
        },
        timeout: 10000,
      });

      const openTrades = response.data.trades || [];

      console.log(`[Close All] Found ${openTrades.length} open trades in table "${tableName}"`);

      if (openTrades.length === 0) {
        console.log(`[Close All] No open trades found in "${tableName}"`);
        continue;
      }

      // Close each trade
      for (const trade of openTrades) {
        try {
          const url = `/manage/${encodeURIComponent(trade.coinName)}?tableName=${encodeURIComponent(tableName)}`;
          const payload = { Action: 'CloseById', id: trade._id };

          const closeResponse = await axios.post(`${SERVER_URL}${url}`, payload, {
            timeout: 10000,
          });

          console.log(`[Close All] Successfully closed ${trade.coinName} in "${tableName}":`, closeResponse.data);
        } catch (error) {
          console.error(
            `[Close All] Error closing ${trade.coinName} in "${tableName}":`,
            error.response?.data || error.message
          );
        }
      }
    }
    
    console.log('[Close All] Finished closing all positions');
  } catch (error) {
    console.error('[Close All] Error:', error.message);
  }
}

module.exports = {
  closeAll,
};
