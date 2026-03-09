const axios = require('axios');
const { getSignedHeader, getBaseUrl } = require('./signature');
let config = require("../config.json")
/**
 * Get all current positions for a symbol
 */
async function getCurrentPositions(symbol,index = 0) {
  const baseUrl = getBaseUrl(index);
  
  try {
    // Use account endpoint to get positions
    let account = config[index].PAPI ? "/papi/v1/um/account" : '/fapi/v2/account'
    const { headers, queryString } = getSignedHeader('GET', account, {}, index);
    
    const resp = await axios.get(`${baseUrl}${account}?${queryString}`, { headers });
    const positions = resp.data.positions || [];
    console.log(`point: ${baseUrl}${account}?${queryString}`)
    console.log(`Active Positions ${positions}`)
    
    // Filter for the specific symbol and non-zero positions
    const symbolPositions = positions.filter(p => 
      p.symbol === symbol && 
      parseFloat(p.positionAmt) !== 0
    );
    
    console.log(`Found ${symbolPositions.length} open positions for ${symbol}:`);
    symbolPositions.forEach(pos => {
      console.log(`  - ${pos.positionSide}: ${pos.positionAmt} (${parseFloat(pos.positionAmt) > 0 ? 'LONG' : 'SHORT'})`);
    });
    
    return symbolPositions;
    
  } catch (error) {
    console.error('Error getting positions:', error.response?.data || error.message);
    throw error;
  }
}
async function listPositions(index = 0) {
  const baseUrl = getBaseUrl(index);
  let account = config[index].PAPI ? "/papi/v1/account" : '/fapi/v2/account'
  try {
    const { headers, queryString } = getSignedHeader('GET', account, {}, index);
    const resp = await axios.get(`${baseUrl}${account}?${queryString}`, { headers });
    // return all open positions
    const openPositions = resp.data.positions.filter(p => parseFloat(p.initialMargin) !== 0);
    // calculate unrealized PnL for each position
    let pnl = 0
    openPositions.forEach(pos => {
      pos.unrealizedPnL = parseFloat(pos.unrealizedProfit);
      pnl += pos.unrealizedPnL;
    });
    return {currentProfit: pnl,openPositions};
  } catch (error) {
    console.error('Error listing positions:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Check for an opposite open position for the given symbol and desired side.
 * If an opposite (non-zero) position exists, close it with a market order first.
 *
 * symbol: e.g. "BTCUSDC"
 * desiredSide: "LONG" or "SHORT" (the position we want to open)
 */
async function closeOppositeIfAny(symbol, desiredSide,index = 0) {
  const baseUrl = getBaseUrl(index);
  let orderEndPoint = config[index].PAPI ? "/papi/v1/um/order" : '/fapi/v1/order'

  try {
    console.log(`\n?? Checking for opposite positions before opening ${desiredSide} for ${symbol}...`);
    
    const positions = await getCurrentPositions(symbol,index);
    
    if (positions.length === 0) {
      return { closed: false, reason: 'no positions found' };
    }
    
    // Find positions to close based on desired side
    let positionsToClose = [];
    
    if (desiredSide === 'LONG') {
      // Want to open LONG, so close any SHORT positions (negative amounts)
      positionsToClose = positions.filter(p => parseFloat(p.positionAmt) < 0);
    } else {
      // Want to open SHORT, so close any LONG positions (positive amounts)  
      positionsToClose = positions.filter(p => parseFloat(p.positionAmt) > 0);
    }

    if (positionsToClose.length === 0) {
      console.log(`?? No opposite positions found to close`);
      return { closed: false, reason: 'no opposite positions to close' };
    }

    console.log(`?? Found ${positionsToClose.length} opposite position(s) to close:`);
    
    const closeResults = [];
    
    // Close each opposite position
    for (const pos of positionsToClose) {
      const positionAmt = Math.abs(parseFloat(pos.positionAmt));
      const direction = parseFloat(pos.positionAmt) > 0 ? 'LONG' : 'SHORT';
      const closeSide = direction === 'LONG' ? 'SELL' : 'BUY';
      
      console.log(`\n?? Closing ${direction} position: ${pos.positionAmt}`);
      console.log(`   Close with: ${closeSide} ${positionAmt}`);
      
      try {
        // Close order with positionSide for hedge mode
        const closeParams = {
          symbol,
          side: closeSide,
          positionSide: pos.positionSide, // Include the position side
          type: 'MARKET',
          quantity: positionAmt.toString()
          // Note: reduceOnly not needed when using positionSide in hedge mode
        };

        console.log(`?? Sending close order:`, closeParams);
        
        const { headers: closeHeaders, queryString: closeQueryString } = getSignedHeader('POST', orderEndPoint, closeParams,index);
        
        const closeResp = await axios.post(`${baseUrl}${orderEndPoint}?${closeQueryString}`, {}, { headers: closeHeaders });
        
        console.log(`? Successfully closed position! Order ID: ${closeResp.data.orderId}`);
        console.log(`   Status: ${closeResp.data.status}`);
        
        closeResults.push({
          success: true,
          orderId: closeResp.data.orderId,
          position: pos,
          closeOrder: closeResp.data
        });
        
        // Wait a moment between closes
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (closeError) {
        console.error(`? Failed to close position:`, closeError.response?.data || closeError.message);
        
        closeResults.push({
          success: false,
          error: closeError.response?.data || closeError.message,
          position: pos
        });
      }
    }
    
    const successfulCloses = closeResults.filter(r => r.success);
    
    if (successfulCloses.length > 0) {
      console.log(`\n?? Successfully closed ${successfulCloses.length} position(s)`);
      return {
        closed: true,
        closedCount: successfulCloses.length,
        results: closeResults
      };
    } else {
      console.log(`\n?? Failed to close any positions`);
      return {
        closed: false,
        reason: 'all close attempts failed',
        results: closeResults
      };
    }

  } catch (err) {
    console.error('? Error in closeOppositeIfAny:', err.response?.data || err.message);
    
    return { 
      closed: false, 
      reason: 'error in close function', 
      error: err.response?.data || err.message 
    };
  }
}

module.exports = { closeOppositeIfAny, getCurrentPositions,listPositions };
