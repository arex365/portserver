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

      if (openTrades.length === 0) {
        continue;
      }

      // Close each trade
      for (const trade of openTrades) {
        let side = trade.positionSide || trade.side || '';
        side = side.toLowerCase();
        await axios.get(`http://board.itsarex.com:5051/${side}/${trade.coinName}/6`)
      }
    }
  } catch (error) {
    // Intentionally ignore top-level errors to avoid extra output.
  }
}

closeAll()