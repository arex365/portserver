const router = require('express').Router();
const { getCollection } = require('../utils/database');

// GET /setbias/:userID/:biasValue - Set or update bias value for a user
router.get('/setbias/:userID/:biasValue', async (req, res) => {
  try {
    const { userID, biasValue } = req.params;
    
    // Validate inputs
    if (!userID || !biasValue) {
      return res.status(400).json({ error: 'userID and biasValue are required' });
    }

    const collection = getCollection('userBias');
    
    // Upsert: update if exists, insert if not
    const result = await collection.updateOne(
      { userID: userID },
      { 
        $set: { 
          biasValue: biasValue,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    res.json({ 
      message: 'Bias set successfully',
      userID,
      biasValue,
      modified: result.modifiedCount > 0,
      created: result.upsertedCount > 0
    });
  } catch (err) {
    console.error('Error setting bias:', err);
    res.status(500).json({ error: 'Error setting bias' });
  }
});

// GET /getbias/:userID - Get bias value for a user
router.get('/getbias/:userID', async (req, res) => {
  try {
    const { userID } = req.params;
    
    if (!userID) {
      return res.status(400).json({ error: 'userID is required' });
    }

    const collection = getCollection('userBias');
    const userBias = await collection.findOne({ userID: userID });

    if (!userBias) {
      return res.status(404).json({ 
        error: 'Bias not found for this user',
        userID 
      });
    }

    res.send(biasValue)
  } catch (err) {
    console.error('Error getting bias:', err);
    res.status(500).json({ error: 'Error getting bias' });
  }
});

module.exports = router;