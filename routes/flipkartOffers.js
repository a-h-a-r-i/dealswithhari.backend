const router    = require("express").Router();
const axios     = require("axios");
const NodeCache = require("node-cache");

const cache = new NodeCache({ stdTTL: 8 * 60 }); // 8-min cache

const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY || "";
const AMAZON_TAG    = process.env.AMAZON_TAG   || "dealsbyhari06-21";
const CUELINKS_BASE = "https://linksredirect.com/?cid=255555&source=linkkit&url=";

const CATEGORY_QUERIES = {
  mobiles:     "best smartphones india 2024",
  electronics: "best electronics deals india",
  fashion:     "best fashion deals india",
  home:        "best home appliances india",
  all:         "best deals india today",
};

function buildAffiliateLink(url) {
  try {
    const h = new URL(url).hostname;
    if (/amazon\.(in|com)/.test(h)) {
      const u = new URL(url);
      u.searchParams.set("tag", AMAZON_TAG);
      return u.toString();
    }
  } catch { /**/ }
  return `${CUELINKS_BASE}${encodeURIComponent(url)}`;
}

// GET /api/offers?category=mobiles|electronics|fashion|home|all&limit=20
router.get("/", async (req, res) => {
  const category = (req.query.category || "all").toLowerCase();
  const limit    = Math.min(parseInt(req.query.limit) || 20, 40);
  const cacheKey = `offers:${category}:${limit}`;

  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  if (!RAPIDAPI_KEY) {
    return res.status(503).json({ error: "Search API not configured", offers: [] });
  }

  try {
    const query = CATEGORY_QUERIES[category] || CATEGORY_QUERIES.all;
    const { data } = await axios.get("https://real-time-product-search.p.rapidapi.com/search", {
      params: { q: query, country: "in", language: "en", limit: String(limit) },
      headers: {
        "X-RapidAPI-Key":  RAPIDAPI_KEY,
        "X-RapidAPI-Host": "real-time-product-search.p.rapidapi.com",
      },
      timeout: 10000,
    });

    const items = data?.data || [];
    const offers = items
      .map(item => {
        const offer = item.offers?.[0] || {};
        const url   = offer.store_url || item.product_page_url || "";
        const price = parseFloat((offer.price || "0").replace(/[^0-9.]/g, "")) || 0;
        const mrp   = parseFloat((offer.original_price || offer.price || "0").replace(/[^0-9.]/g, "")) || price;
        const discount = mrp > price && price > 0 ? Math.round(((mrp - price) / mrp) * 100) : 0;
        return {
          id:          item.product_id || Math.random().toString(36).slice(2),
          title:       item.product_title || "",
          description: item.product_description || "",
          image:       item.product_photos?.[0] || "",
          category:    category,
          url,
          affiliateUrl: buildAffiliateLink(url),
          price,
          mrp,
          discount,
          rating:      parseFloat(item.product_rating) || 0,
          store:       offer.store_name || "Store",
        };
      })
      .filter(o => o.title && o.url && o.price > 0)
      .slice(0, limit);

    const result = { offers, total: offers.length, category };
    cache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error("Offers fetch error:", err.message);
    res.status(502).json({ error: "Failed to fetch offers", offers: [] });
  }
});

module.exports = router;
