const router = require('express').Router();

router.get('/txt', (req, res) => {
    res.send('Production');
});
module.exports = router;