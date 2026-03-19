/**
 * productSearch.js
 * Real product data fetching from multiple sources.
 *
 * Strategy (in order):
 * 1. Check MongoDB cache (fresh within 6 hours)
 * 2. RapidAPI Real-Time Product Search (covers Amazon + Flipkart + more)
 * 3. Fallback: scrape basic data from the original URL via Cheerio
 */

const axios = require("axios");
const cheerio = require("cheerio");
const NodeCache = require("node-cache");
const { normalize, scoreProducts } = require("./matcher");

// In-memory cache: 6 hours TTL
const cache = new NodeCache({ stdTTL: 6 * 60 * 60 });

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || "";
const AMAZON_TAG   = process.env.AMAZON_TAG || "dealsbyhari06-21";
const CUELINKS_BASE = "https://linksredirect.com/?cid=255555&source=linkkit&url=";

// ── Platform detection ────────────────────────────────────────────────────────
function detectPlatform(url) {
  try {
    const h = new URL(url).hostname;
    if (/amazon\.(in|com)/.test(h) || /amzn\.(in|to)/.test(h)) return "Amazon";
    if (h.includes("flipkart.com")) return "Flipkart";
    if (h.includes("myntra.com"))   return "Myntra";
    if (h.includes("ajio.com"))     return "Ajio";
    if (h.includes("meesho.com"))   return "Meesho";
    if (h.includes("snapdeal.com")) return "Snapdeal";
  } catch { /**/ }
  return "Other";
}

// ── Build affiliate link ──────────────────────────────────────────────────────
function buildAffiliateLink(url, platform) {
  if (platform === "Amazon") {
    try {
      const u = new URL(url);
      u.searchParams.set("tag", AMAZON_TAG);
      return u.toString();
    } catch { return url; }
  }
  return `${CUELINKS_BASE}${encodeURIComponent(url)}`;
}

// ── Extract product title from URL path ───────────────────────────────────────
function titleFromUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const skip = new Set(["dp","p","product","item","buy","s","search","ref","itm","gp","html"]);
    const seg = u.pathname.split("/").filter(Boolean).find(
      (s) => s.length > 8 && !skip.has(s.toLowerCase()) && !/^[A-Z0-9]{8,12}$/.test(s)
    );
    return seg ? seg.replace(/-/g, " ").replace(/_/g, " ") : "";
  } catch { return ""; }
}

// ── RapidAPI: Real-Time Product Search ───────────────────────────────────────
// Docs: https://rapidapi.com/letscrape-6bRBa3QguO5/api/real-time-product-search
async function searchRapidAPI(query, country = "in") {
  if (!RAPIDAPI_KEY) return [];

  const cacheKey = `rapid:${query}:${country}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const { data } = await axios.get("https://real-time-product-search.p.rapidapi.com/search", {
      params: { q: query, country, language: "en", limit: "10" },
      headers: {
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": "real-time-product-search.p.rapidapi.com",
      },
      timeout: 8000,
    });

    const results = (data?.data || []).map((item) => {
      const offer = item.offers?.[0] || {};
      const platform = detectPlatform(offer.store_url || item.product_page_url || "");
      const productUrl = offer.store_url || item.product_page_url || "";
      const price = parseFloat((offer.price || "0").replace(/[^0-9.]/g, "")) || 0;

      return {
        title:         item.product_title || query,
        price,
        originalPrice: price,
        image:         item.product_photos?.[0] || "",
        site:          platform || offer.store_name || "Other",
        url:           productUrl,
        affiliateLink: buildAffiliateLink(productUrl, platform),
        rating:        parseFloat(item.product_rating) || 0,
        reviews:       parseInt(item.product_num_reviews) || 0,
        source:        "rapidapi",
      };
    }).filter((p) => p.price > 0 && p.url);

    cache.set(cacheKey, results);
    return results;
  } catch (err) {
    console.error("RapidAPI error:", err.message);
    return [];
  }
}

// ── Cheerio scraper: extract basic data from a product URL ───────────────────
async function scrapeProductPage(url, platform) {
  const cacheKey = `scrape:${url}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const { data } = await axios.get(url, {
      timeout: 8000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept-Language": "en-IN,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml",
      },
    });

    const $ = cheerio.load(data);
    let title = "", price = 0, image = "";

    if (platform === "Amazon") {
      title = $("#productTitle").text().trim() ||
              $("h1.a-size-large").text().trim();
      const priceStr = $(".a-price-whole").first().text().replace(/[^0-9]/g, "");
      price = parseInt(priceStr) || 0;
      image = $("#landingImage").attr("src") ||
              $("#imgBlkFront").attr("src") || "";
    } else if (platform === "Flipkart") {
      title = $("h1.yhB1nd, span.B_NuCI, h1._6EBuvT").first().text().trim();
      const priceStr = $("div._30jeq3, div._16Jk6d").first().text().replace(/[^0-9]/g, "");
      price = parseInt(priceStr) || 0;
      image = $("img._396cs4, img._2r_T1I").first().attr("src") || "";
    } else if (platform === "Myntra") {
      title = $("h1.pdp-title, h1.pdp-name").text().trim();
      const priceStr = $("span.pdp-price strong, div.pdp-price").first().text().replace(/[^0-9]/g, "");
      price = parseInt(priceStr) || 0;
      image = $("img.image-grid-image").first().attr("src") || "";
    } else {
      // Generic fallback
      title = $("h1").first().text().trim() || titleFromUrl(url);
      const priceStr = $("[class*='price']").first().text().replace(/[^0-9]/g, "");
      price = parseInt(priceStr) || 0;
      image = $("meta[property='og:image']").attr("content") || "";
    }

    if (!title) title = titleFromUrl(url);

    const result = {
      title,
      price,
      originalPrice: price,
      image,
      site: platform,
      url,
      affiliateLink: buildAffiliateLink(url, platform),
      rating: 0,
      reviews: 0,
      source: "scrape",
    };

    cache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.error(`Scrape error (${platform}):`, err.message);
    return null;
  }
}

// ── Main: get product + compare prices ───────────────────────────────────────
/**
 * Given a product URL:
 * 1. Scrape the original product page to get title + price
 * 2. Search RapidAPI for the same product on other sites
 * 3. Return grouped results
 */
async function getProductWithComparisons(productUrl) {
  const platform = detectPlatform(productUrl);

  // Step 1: Get the original product data
  const original = await scrapeProductPage(productUrl, platform);
  const searchTitle = original?.title || titleFromUrl(productUrl);

  if (!searchTitle) {
    return { original: null, comparisons: [], searchTitle: "" };
  }

  // Step 2: Search other sites via RapidAPI
  let comparisons = await searchRapidAPI(searchTitle);

  // Step 3: If RapidAPI unavailable, return just the original
  if (!comparisons.length && original) {
    comparisons = [{ ...original }];
  }

  // Step 4: Deduplicate — remove entries too similar to each other
  const deduped = deduplicateResults(comparisons);

  // Step 5: Sort by price
  deduped.sort((a, b) => a.price - b.price);

  return {
    original,
    searchTitle,
    comparisons: deduped,
    lowestPrice: deduped[0]?.price || 0,
    lowestSite:  deduped[0]?.site || "",
  };
}

// ── Deduplication ─────────────────────────────────────────────────────────────
function deduplicateResults(products) {
  const seen = [];
  for (const p of products) {
    const isDup = seen.some((s) => {
      const { score } = scoreProducts({ title: s.title, brand: "" }, { title: p.title, brand: "" });
      return score > 0.85 && s.site === p.site;
    });
    if (!isDup) seen.push(p);
  }
  return seen;
}

module.exports = { getProductWithComparisons, detectPlatform, titleFromUrl, buildAffiliateLink };
