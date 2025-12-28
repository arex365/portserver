const express = require("express");
const { getCollection } = require("../utils/database");
const router = express.Router();


const Strategies = () => getCollection("Strategies");

/**
 * Subscribe
 * Body:
 * {
 *   strategy: "SHIFT2",
 *   id: 0,
 *   coin: "BTC",
 *   amount: 20
 * }
 */
router.post("/subscribe", async (req, res) => {
  try {
    const { strategy, id, coin, amount } = req.body;

    if (!strategy || id === undefined || !coin || amount === undefined)
      return res.status(400).json({ error: "Missing fields" });

    const col = Strategies();

    // 1️⃣ Ensure strategy exists with entries array
    await col.updateOne(
      { name: strategy },
      { $setOnInsert: { name: strategy, entries: [] } },
      { upsert: true }
    );

    // 2️⃣ Try update existing entry
    const updateResult = await col.updateOne(
      { name: strategy, "entries.id": id },
      {
        $set: { "entries.$.amount": amount },
        $addToSet: { "entries.$.whitelist": coin }
      }
    );

    // 3️⃣ If entry didn't exist → push new one
    if (updateResult.matchedCount === 0) {
      await col.updateOne(
        { name: strategy },
        {
          $push: {
            entries: { id, whitelist: [coin], amount }
          }
        }
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});



/**
 * Unsubscribe
 * Body:
 * {
 *   strategy: "SHIFT2",
 *   id: 0,
 *   coin: "BNB"
 * }
 */
router.post("/unsubscribe", async (req, res) => {
  try {
    const { strategy, id, coin } = req.body;

    if (!strategy || id === undefined || !coin)
      return res.status(400).json({ error: "Missing fields" });

    await Strategies().updateOne(
      { name: strategy, "entries.id": id },
      {
        $pull: { "entries.$.whitelist": coin }
      }
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});


/**
 * Get all subscriptions
 */
router.get("/subscriptions", async (req, res) => {
  try {
    const { strategy, id } = req.query;

    const match = {};
    if (strategy) match.name = strategy;

    const docs = await Strategies().find(match).toArray();

    const data = docs.map(d => ({
      strategy: d.name,
      entries:
        id !== undefined
          ? (d.entries || []).filter(e => e.id === Number(id))
          : (d.entries || [])
    }));

    res.json(data);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});


module.exports = router;
