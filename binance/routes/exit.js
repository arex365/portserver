const router = require('express').Router();
const axios = require('axios');
const { getSignedHeader, getBaseUrl } = require('../utils/signature');
const { getPrice } = require('../utils/price');
const { getLotSize, getMinNotional, getQuantityPrecision, formatQuantity } = require('../utils/lotsize');
const { closeOppositeIfAny } = require('../utils/checkposition');
const { setPositionMode, getPositionMode } = require('../utils/positionMode');
const config = require('../config.json');

router.post('/exit/:coin/:invest', async (req, res) => {
    const index = Number(req.params.index || req.query.index) || 0;
    const symbol = `${req.params.coin}${config[index].QUOTE_ASSET}`;
    // Ensure any opposite (short) position is closed first
    console.log(`\n=== Checking for opposite positions before opening LONG ===`);
    const closeLong = await closeOppositeIfAny(symbol, 'LONG', index);
    console.log('Close opposite result:', JSON.stringify(closeLong, null, 2));
    const closeShort = await closeOppositeIfAny(symbol, 'SHORT', index);
    console.log('Close opposite result:', JSON.stringify(closeShort, null, 2));
    return res.status(200).json({
        message: "Opposite positions closed (if any). No new position opened as this is an EXIT action.",
        closeLong,
        closeShort
    });
});

module.exports = router;
