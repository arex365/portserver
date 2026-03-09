const router = require('express').Router();
router.get('/', (req, res) => {
  res.send('version 4');
});
module.exports = router;