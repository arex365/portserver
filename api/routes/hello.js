const router = require('express').Router();

router.get('/txt', (req, res) => {
    res.send('Hello, World!');
});
module.exports = router;