const router = require('express').Router();

router.get('/txt', (req, res) => {
    res.send('Production v2');
});
module.exports = router;