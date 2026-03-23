const router  = require("express").Router();
const axios   = require("axios");
const NodeCache = require("node-cache");

const cache = new NodeCache({ stdTTL: 7 * 60 }); // 7-min cache

const FK_HEADERS = {
  "Fk-Affiliate-Id":    process.env.FK_AFFILIATE_ID    || "vsaikiran1",
  "Fk-Affiliate-Token": process.env.FK_AFFILIATE_TOKEN || "f03613ca9275401ea427e70d1a791394",
};

const ALL_URL  = "https://affiliate-api.flipkart.net/affiliate/offers/v1/all/json";
const DOTD_URL = "https://affiliate-api.flipkart.net/affiliate/offers/v1/dotd/json";

function parseOffer(item) {
  const prod = item.productBaseInfo?.productAttributes || {};
  const offer = item.productBaseInfo?.productPaymentInfo || {};
  const img = prod.imageUrls?.["400x400"] || prod.imageUrls?.["200x200"] || "";
  return {
    id:           item.productBaseInfo?.productIdentifier?.productId || "",
    title:        prod.title || "",
    description:  prod.productDescription || prod.shortDescription || "",
    image:        img,
    category:     prod.categoryPath || prod.category || "",
    url:          item.productBaseInfo?.productIdentifier?.productUrl || "",
    price:        offer.flipkartSpecialPrice || offer.maximumRetailPrice || 0,
    mrp:          offer.maximumRetailPrice || 0,
    discount:     offer.discount || 0,
    available:    item.productBaseInfo?.productIdentifier?.availability === "Available",
  };
}

// GET /api/offers?type=all|dotd&category=&limit=20
router.get("/", async (req, res) => {
  const type     = req.query.type === "dotd" ? "dotd" : "all";
  const limit    = Math.min(parseInt(req.query.limit) || 20, 50);
  const category = (req.query.category || "").toLowerCase();
  const cacheKey = `fk:${type}:${category}:${limit}`;

  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const apiUrl = type === "dotd" ? DOTD_URL : ALL_URL;
    const { data } = await axios.get(apiUrl, {
      headers: FK_HEADERS,
      timeout: 10000,
    });

    // Flipkart returns { offers: { offer: [...] } } or similar
    const raw = data?.offers?.offer || data?.dotdOffers?.offer || data?.allOffers?.offer || [];
    let offers = raw.map(parseOffer).filter(o => o.title && o.url && o.available);

    if (category) {
      offers = offers.filter(o => o.category.toLowerCase().includes(category));
    }

    const result = { offers: offers.slice(0, limit), total: offers.length, type };
    cache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error("Flipkart offers error:", err.message);
    res.status(502).json({ error: "Failed to fetch Flipkart offers", detail: err.message });
  }
});

module.exports = router;
