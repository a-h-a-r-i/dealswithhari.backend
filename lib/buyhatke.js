/**
 * buyhatke.js
 *
 * Uses BuyHatke's priceData API to get live prices across platforms.
 * Platform IDs discovered from their public API calls.
 *
 * Flow:
 * 1. Extract PID from product URL using platform-specific regex
 * 2. Build param array: [[platformId, pid], ...]
 * 3. Call priceData API → get prices from all platforms
 * 4. Attach affiliate links to each result
 */

const axios     = require("axios");
const NodeCache = require("node-cache");

const cache = new NodeCache({ stdTTL: 2 * 60 * 60 }); // 2h cache

const AMAZON_TAG    = process.env.AMAZON_TAG || "dealsbyhari06-21";
const CUELINKS_BASE = "https://linksredirect.com/?cid=255555&source=linkkit&url=";

// ── Platform ID map (from BuyHatke's internal config) ────────────────────────
const PLATFORMS = {
  amazon:   { id: 63,   name: "Amazon" },
  flipkart: { id: 6660, name: "Flipkart" },
  myntra:   { id: 6607, name: "Myntra" },
  snapdeal: { id: 71,   name: "Snapdeal" },
  ajio:     { id: 6178, name: "Ajio" },
  croma:    { id: 8983, name: "Croma" },
  nykaa:    { id: 7907, name: "Nykaa" },
  meesho:   { id: 25622,name: "Meesho" },
};

// ── PID extraction regex per platform ────────────────────────────────────────
function extractPid(url) {
  try {
    const u   = new URL(url);
    const h   = u.hostname;
    const p   = u.pathname;

    // Amazon: /dp/ASIN or /gp/product/ASIN
    if (/amazon\.(in|com)/i.test(h)) {
      const m = p.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
      if (m) return { platform: "amazon", pid: m[1] };
    }

    // Flipkart: /product-slug/p/itmXXXXXX or path slug + numeric id
    if (h.includes("flipkart")) {
      // Try /p/itm format → use path slug + numeric id
      const segments = p.split("/").filter(Boolean);
      const pIdx = segments.findIndex(s => s === "p");
      if (pIdx > 0) {
        const slug    = segments[pIdx - 1];
        const itemId  = segments[pIdx + 1] || "";
        // BuyHatke Flipkart PID format: "category/slug/numericId"
        // Simpler: just use "slug/itemId" or the full path
        const pid = `${slug}/${itemId}`.replace(/[?#].*/, "");
        return { platform: "flipkart", pid };
      }
      // Fallback: use full path
      return { platform: "flipkart", pid: p.replace(/^\//, "").replace(/[?#].*/, "") };
    }

    // Myntra: /brand/product-name/buy/productId
    if (h.includes("myntra")) {
      const m = p.match(/\/buy\/(\d+)/);
      if (m) return { platform: "myntra", pid: m[1] };
      const parts = p.split("/").filter(Boolean);
      if (parts.length >= 2) return { platform: "myntra", pid: `${parts[0]}~${parts[1]}` };
    }

    // Snapdeal: /product/name/numericId
    if (h.includes("snapdeal")) {
      const m = p.match(/\/product\/[^/]+\/(\d+)/);
      if (m) return { platform: "snapdeal", pid: m[1] };
    }

    // Ajio: /p/productCode
    if (h.includes("ajio")) {
      const m = p.match(/\/p\/([A-Z0-9_-]+)/i);
      if (m) return { platform: "ajio", pid: m[1] };
    }

    // Croma: /p/productId
    if (h.includes("croma")) {
      const m = p.match(/\/p\/(\d+)/);
      if (m) return { platform: "croma", pid: m[1] };
    }

    // Nykaa: /product/name/p/numericId
    if (h.includes("nykaa")) {
      const m = p.match(/\/p\/(\d+)/);
      if (m) return { platform: "nykaa", pid: m[1] };
    }

    // Meesho: /product-name/p/numericId
    if (h.includes("meesho")) {
      const m = p.match(/\/p\/(\d+)/);
      if (m) return { platform: "meesho", pid: m[1] };
    }

  } catch { /**/ }
  return null;
}

// ── Build affiliate link ──────────────────────────────────────────────────────
function buildAffiliateLink(url, platform) {
  if (!url) return "";
  if (platform === "Amazon") {
    try {
      const u = new URL(url);
      u.searchParams.set("tag", AMAZON_TAG);
      ["linkCode","linkId","ref","psc"].forEach(k => u.searchParams.delete(k));
      return u.toString();
    } catch { return url; }
  }
  return `${CUELINKS_BASE}${encodeURIComponent(url)}`;
}

// ── Call BuyHatke priceData API ───────────────────────────────────────────────
async function fetchPriceData(params) {
  try {
    const { data } = await axios.post(
      "https://search-new.bitbns.com/buyhatke/thunder/priceData",
      { param: params },
      {
        timeout: 12000,
        headers: {
          "accept": "*/*",
          "content-type": "application/json",
          "origin": "https://buyhatke.com",
          "referer": "https://buyhatke.com/",
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
        },
      }
    );
    return data;
  } catch (err) {
    console.error("BuyHatke priceData error:", err.message);
    return null;
  }
}

// ── Map platform ID back to name ──────────────────────────────────────────────
function platformIdToName(id) {
  for (const [, v] of Object.entries(PLATFORMS)) {
    if (v.id === id) return v.name;
  }
  return "Other";
}

// ── Main: get price comparisons for a product URL ─────────────────────────────
async function getPriceComparisons(productUrl) {
  const cacheKey = `bhprice:${productUrl}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const extracted = extractPid(productUrl);
  if (!extracted) {
    console.log("Could not extract PID from:", productUrl);
    return null;
  }

  const { platform, pid } = extracted;
  const sourcePlatform = PLATFORMS[platform];
  if (!sourcePlatform) return null;

  console.log(`🔍 BuyHatke: platform=${platform} pid=${pid}`);

  // Build params: query the source platform + all other major platforms
  // For cross-platform search, we use the source PID on all platforms
  // BuyHatke will return prices only for platforms where the product exists
  const params = [
    [sourcePlatform.id, pid],
    // Also try other platforms with same PID (BuyHatke handles mismatches)
  ];

  // For Flipkart products, also try Amazon with the slug
  if (platform === "flipkart") {
    // Extract just the slug part for cross-platform search
    const slug = pid.split("/")[0];
    params.push([PLATFORMS.amazon.id, slug]);
    params.push([PLATFORMS.myntra.id, slug]);
  }

  const raw = await fetchPriceData(params);
  if (!raw) return null;

  console.log("BuyHatke raw response:", JSON.stringify(raw).slice(0, 500));

  // Parse response — BuyHatke returns array of price objects
  const results = [];
  const responseArray = Array.isArray(raw) ? raw : (raw.data || raw.result || []);

  for (const item of responseArray) {
    const price = parseFloat(String(item.price || item.salePrice || 0).replace(/[^0-9.]/g, ""));
    if (!price) continue;

    const platformName = platformIdToName(item.pos || item.platformId) || item.platform || "Other";
    const url = item.link || item.url || item.productUrl || "";

    results.push({
      title:         item.title || item.name || "",
      price,
      originalPrice: parseFloat(String(item.mrp || item.originalPrice || price).replace(/[^0-9.]/g, "")) || price,
      image:         item.image || item.thumbnail || "",
      site:          platformName,
      url,
      affiliateLink: buildAffiliateLink(url, platformName),
      rating:        item.rating || 0,
      reviews:       item.reviews || 0,
      sponsored:     false,
      source:        "buyhatke",
    });
  }

  results.sort((a, b) => a.price - b.price);

  const result = {
    pid,
    platform,
    comparisons:  results,
    lowestPrice:  results[0]?.price || 0,
    lowestSite:   results[0]?.site  || "",
    totalFound:   results.length,
  };

  if (results.length > 0) cache.set(cacheKey, result);
  return result;
}

module.exports = { getPriceComparisons, extractPid };
