const router = require("express").Router();
const Link   = require("../models/Link");
const User   = require("../models/User");

// ── Save a generated link ──
router.post("/", async (req, res) => {
  try {
    const { userId, originalUrl, affiliateLink, shortLink, platform } = req.body;
    if (!userId || !originalUrl || !affiliateLink)
      return res.status(400).json({ error: "Missing fields" });

    const link = await Link.create({ userId, originalUrl, affiliateLink, shortLink, platform });
    res.status(201).json({ link });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Get all links for a user ──
router.get("/:userId", async (req, res) => {
  try {
    const links = await Link.find({ userId: req.params.userId }).sort({ createdAt: -1 });
    res.json({ links });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Delete a link ──
router.delete("/:linkId", async (req, res) => {
  try {
    await Link.findByIdAndDelete(req.params.linkId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Track a click (called when Buy Now is clicked) ──
router.post("/:linkId/click", async (req, res) => {
  try {
    const link = await Link.findByIdAndUpdate(
      req.params.linkId,
      { $inc: { clicks: 1 } },
      { new: true }
    );
    if (!link) return res.status(404).json({ error: "Link not found" });

    // Update user total clicks
    await User.findByIdAndUpdate(link.userId, { $inc: { totalClicks: 1 } });
    res.json({ clicks: link.clicks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
