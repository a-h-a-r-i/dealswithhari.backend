const router = require("express").Router();
const { getComparisons } = require("../lib/googleShopping");

/**
 * POST /api/search
 * Body: { url: "https://www.flipkart.com/..." }
 */
router.post("/", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "url is required" });
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const result = await getComparisons(normalized);
    res.json(result);
  } catch (err) {
    console.error("search error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "url query param required" });
    const result = await getComparisons(url);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
