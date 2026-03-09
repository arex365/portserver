const axios = require('axios');
const { getSignedHeader, getBaseUrl } = require('./signature');

/**
 * Set position mode to hedge mode (allows LONG/SHORT position sides)
 * or one-way mode (no position sides)
 */
async function setPositionMode(dualSidePosition = true,index = 0) {
  const baseUrl = getBaseUrl(index);
  
  try {
    const { headers, queryString } = getSignedHeader('POST', '/fapi/v1/positionSide/dual', {
      dualSidePosition: dualSidePosition.toString()
    }, index);
    
    const response = await axios.post(`${baseUrl}/fapi/v1/positionSide/dual?${queryString}`, {}, { headers });
    
    return {
      success: true,
      mode: dualSidePosition ? 'Hedge Mode (LONG/SHORT)' : 'One-way Mode',
      response: response.data
    };
    
  } catch (error) {
    // If error code -4059, it means position mode is already set correctly
    if (error.response?.data?.code === -4059) {
      return {
        success: true,
        mode: dualSidePosition ? 'Hedge Mode (LONG/SHORT)' : 'One-way Mode',
        message: 'Position mode already set correctly'
      };
    }
    
    console.error('Error setting position mode:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get current position mode
 */
async function getPositionMode(index = 0) {
  const baseUrl = getBaseUrl(index);
  
  try {
    const { headers, queryString } = getSignedHeader('GET', '/fapi/v1/positionSide/dual', {}, index);
    
    const response = await axios.get(`${baseUrl}/fapi/v1/positionSide/dual?${queryString}`, { headers });
    
    return {
      dualSidePosition: response.data.dualSidePosition,
      mode: response.data.dualSidePosition ? 'Hedge Mode (LONG/SHORT)' : 'One-way Mode'
    };
    
  } catch (error) {
    console.error('Error getting position mode:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = { setPositionMode, getPositionMode };