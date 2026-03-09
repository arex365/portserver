const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent]
});



client.login('MTEwMDUwOTI4Mzk0MDA0MDc1Ng.GAIYdC.UrHj8iSlBCgVU3G8BH3xVu2JDmysqPvu2aTyHE');

let router = require('express').Router();
router.get('/msg/:msg', async (req, res) => {
  const { msg } = req.params;
  const userID = '933692204143243294';
  try {
    const user = await client.users.fetch(userID);
    await user.send(msg);
    client.destroy();
    res.send("Message sent");
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).send("Error sending message");
  }
});
module.exports = router;