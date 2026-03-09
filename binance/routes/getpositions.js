const router = require('express').Router();
const axios = require('axios');
const {listPositions} = require('../utils/checkposition');
router.get("/list",async(req,res)=>{
    try{
        const index = Number(req.query.index) || 0;
        const positions = await listPositions(index);
        res.json({positions})
    }catch(err){
        console.error(err);
        res.status(500).json({error: err.message || "Internal Server Error"})
    }
})
module.exports = router;