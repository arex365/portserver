const express = require('express');
const axios = require('axios');
const router = express.Router();
router.get('/activeTrades', (req, res) => {
    let id = req.query.id;
    axios.get(`http://board.itsarex.com:5051/list?index=${id}`)
        .then(response => {
            res.send(response.data);
        })
        .catch(error => {
            console.error(error);
            res.status(500).send('Error fetching active trades');
        });
});
module.exports = router;