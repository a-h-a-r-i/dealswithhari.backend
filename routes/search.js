const router = require("express").Router();
const { getComparisons }      = require("../lib/googleShopping");
const { getPriceComparisons, extractPid } = require("../lib/buyhatke");

/**
 * POST /api/search
 * Body: { url: "https://www.flipkart.com/..." }
 *
 * Strategy:
 * 1. Try BuyHatke priceData API (exact product, multiple platforms)
 * 2. Fall back to SerpAPI Google Shopping (broader but works for any URL)
 */
router.post("/", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "url is required" });

    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;

    // Step 1: Try BuyHatke (exact product matching)
    const pid = extractPid(normalized);
    if (pid) {
      console.log(`🎯 Trying BuyHatke for ${pid.platform}:${pid.pid}`);
      const bhResult = await getPriceComparisons(normalized);
      if (bhResult && bhResult.comparisons.length > 0) {
        console.log(`✅ BuyHatke returned ${bhResult.comparisons.length} results`);
        // Get product title from Google Shopping as well for display
        const gsResult = await getComparisons(normalized).catch(() => null);
        return res.json({
          searchTitle:  gsResult?.searchTitle || pid.pid.replace(/-/g, " "),
          searchQuery:  pid.pid,
          comparisons:  bhResult.comparisons,
          lowestPrice:  bhResult.lowestPrice,
          lowestSite:   bhResult.lowestSite,
          totalFound:   bhResult.totalFound,
          source:       "buyhatke",
        });
      }
      console.log("BuyHatke returned no results, falling back to SerpAPI");
    }

    // Step 2: Fall back to SerpAPI Google Shopping
    const result = await getComparisons(normalized);
    res.json({ ...result, source: "serpapi" });

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
