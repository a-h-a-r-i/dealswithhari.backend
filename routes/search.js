const router = require("express").Router();
const { getComparisons }   = require("../lib/googleShopping");
const { searchProducts }   = require("../lib/rapidSearch");

/**
 * POST /api/search
 * Body: { url: "https://www.flipkart.com/..." }
 *
 * Strategy:
 * 1. Resolve short/redirect URL → real product URL
 * 2. Extract product title from URL slug or page scrape
 * 3. Try RapidAPI Real-Time Product Search (primary)
 * 4. Fall back to SerpAPI Google Shopping
 */
router.post("/", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "url is required" });

    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;

    // getComparisons handles: resolve short URL → scrape title → search
    // We reuse its title extraction + URL resolution, then try RapidAPI first
    const { resolveUrl, scrapeTitle, detectPlatform } = require("../lib/googleShopping");

    // Step 1: Resolve redirects (handles dl.flipkart.com, amzn.in, etc.)
    const resolvedUrl = await resolveUrl(normalized);
    console.log(`🔗 Resolved: ${resolvedUrl}`);

    // Step 2: Extract product title
    const platform = detectPlatform(resolvedUrl);
    const rawTitle = await scrapeTitle(resolvedUrl, platform);
    console.log(`📝 Title: "${rawTitle}" (${platform})`);

    if (!rawTitle) {
      return res.json({ searchTitle: "", comparisons: [], lowestPrice: 0, lowestSite: "", totalFound: 0 });
    }

    // Clean title for search
    const searchQuery = rawTitle
      .replace(/\(.*?\)/g, "")
      .replace(/\[.*?\]/g, "")
      .replace(/\b(buy|online|india|free|shipping|latest|best|offer|deal|discount|review|price)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean)
      .slice(0, 10)
      .join(" ");

    console.log(`🔍 Search query: "${searchQuery}"`);

    // Step 3: Try RapidAPI first
    let comparisons = [];
    let source = "none";

    if (process.env.RAPIDAPI_KEY) {
      comparisons = await searchProducts(searchQuery);
      if (comparisons.length > 0) {
        source = "rapidapi";
        console.log(`✅ RapidAPI: ${comparisons.length} results`);
      }
    }

    // Step 4: Fall back to SerpAPI
    if (comparisons.length === 0 && process.env.SERPAPI_KEY) {
      console.log("⚠️  RapidAPI empty, falling back to SerpAPI...");
      const gsResult = await getComparisons(resolvedUrl);
      comparisons = gsResult.comparisons || [];
      source = "serpapi";
      console.log(`✅ SerpAPI: ${comparisons.length} results`);
    }

    comparisons.sort((a, b) => a.price - b.price);

    return res.json({
      searchTitle: rawTitle,
      searchQuery,
      comparisons,
      lowestPrice: comparisons[0]?.price || 0,
      lowestSite:  comparisons[0]?.site  || "",
      totalFound:  comparisons.length,
      source,
    });

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
