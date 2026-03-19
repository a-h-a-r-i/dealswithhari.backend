/**
 * rapidSearch.js
 * Uses RapidAPI Real-Time Product Search to find the same product
 * across Amazon, Flipkart, Myntra etc. with live prices.
 */

const axios     = require("axios");
const NodeCache = require("node-cache");

const cache = new NodeCache({ stdTTL: 2 * 60 * 60 }); // 2h

const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY || "";
const AMAZON_TAG    = process.env.AMAZON_TAG   || "dealsbyhari06-21";
const CUELINKS_BASE = "https://linksredirect.com/?cid=255555&source=linkkit&url=";

function buildAffiliateLink(url, site) {
  if (!url) return "";
  if (/amazon\.(in|com)/i.test(site) || /amazon\.(in|com)/i.test(url)) {
    try {
      const u = new URL(url);
      u.searchParams.set("tag", AMAZON_TAG);
      return u.toString();
    } catch { return url; }
  }
  return `${CUELINKS_BASE}${encodeURIComponent(url)}`;
}

function parsePrice(p) {
  return parseFloat(String(p || "0").replace(/[^0-9.]/g, "")) || 0;
}

function normalizeSite(store = "") {
  const s = store.toLowerCase();
  if (s.includes("amazon"))   return "Amazon";
  if (s.includes("flipkart")) return "Flipkart";
  if (s.includes("myntra"))   return "Myntra";
  if (s.includes("ajio"))     return "Ajio";
  if (s.includes("meesho"))   return "Meesho";
  if (s.includes("snapdeal")) return "Snapdeal";
  if (s.includes("nykaa"))    return "Nykaa";
  if (s.includes("croma"))    return "Croma";
  if (s.includes("tatacliq")) return "TataCliq";
  return store;
}

async function searchProducts(query) {
  if (!RAPIDAPI_KEY) {
    console.warn("RAPIDAPI_KEY not set");
    return [];
  }

  const cacheKey = `rapid:${query}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  try {
    const { data } = await axios.get(
      "https://real-time-product-search.p.rapidapi.com/search",
      {
        params: {
          q:          query,
          country:    "in",
          language:   "en",
          limit:      "20",
          sort_by:    "BEST_MATCH",
        },
        headers: {
          "x-rapidapi-key":  RAPIDAPI_KEY,
          "x-rapidapi-host": "real-time-product-search.p.rapidapi.com",
        },
        timeout: 12000,
      }
    );

    const items = data?.data || data?.products || data?.results || [];
    const results = [];

    for (const item of items) {
      // Each item may have offers from multiple stores
      const offers = item.offers || item.stores || [];

      if (offers.length > 0) {
        for (const offer of offers) {
          const price = parsePrice(offer.price || offer.sale_price);
          if (!price) continue;
          const site = normalizeSite(offer.store_name || offer.store || "");
          const url  = offer.offer_page_url || offer.link || item.product_page_url || "";
          results.push({
            title:         item.product_title || item.title || query,
            price,
            originalPrice: parsePrice(offer.original_price || offer.mrp || price),
            image:         item.product_photos?.[0] || item.thumbnail || "",
            site,
            url,
            affiliateLink: buildAffiliateLink(url, site),
            rating:        parseFloat(item.product_rating || item.rating || 0),
            reviews:       parseInt(item.product_num_reviews || item.reviews || 0),
            sponsored:     false,
            source:        "rapidapi",
          });
        }
      } else {
        // Single product entry
        const price = parsePrice(item.offer?.price || item.price || item.sale_price);
        if (!price) continue;
        const site = normalizeSite(item.store || item.source || "");
        const url  = item.product_page_url || item.offer?.offer_page_url || item.link || "";
        results.push({
          title:         item.product_title || item.title || query,
          price,
          originalPrice: parsePrice(item.offer?.original_price || item.original_price || price),
          image:         item.product_photos?.[0] || item.thumbnail || "",
          site,
          url,
          affiliateLink: buildAffiliateLink(url, site),
          rating:        parseFloat(item.product_rating || item.rating || 0),
          reviews:       parseInt(item.product_num_reviews || item.reviews || 0),
          sponsored:     false,
          source:        "rapidapi",
        });
      }
    }

    // Dedupe by site, keep lowest price per site
    const bySite = {};
    for (const r of results) {
      if (!bySite[r.site] || r.price < bySite[r.site].price) {
        bySite[r.site] = r;
      }
    }
    const deduped = Object.values(bySite).sort((a, b) => a.price - b.price);

    console.log(`📦 RapidAPI: ${deduped.length} results for "${query}"`);
    if (deduped.length > 0) cache.set(cacheKey, deduped);
    return deduped;
  } catch (err) {
    console.error("RapidAPI error:", err.response?.data || err.message);
    return [];
  }
}

module.exports = { searchProducts };
