/**
 * googleShopping.js
 *
 * Flow:
 * 1. Receive a product URL (Amazon / Flipkart / etc.)
 * 2. Scrape the page title using Cheerio
 * 3. Search Google Shopping via SerpAPI
 * 4. Return results: image, price, site, affiliate link
 */

const axios     = require("axios");
const cheerio   = require("cheerio");
const NodeCache = require("node-cache");

const cache = new NodeCache({ stdTTL: 6 * 60 * 60 }); // 6h cache

const SERPAPI_KEY   = process.env.SERPAPI_KEY || "";
const AMAZON_TAG    = process.env.AMAZON_TAG  || "dealsbyhari06-21";
const CUELINKS_BASE = "https://linksredirect.com/?cid=255555&source=linkkit&url=";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
];
const randomUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

// ── Platform detection ────────────────────────────────────────────────────────
function detectPlatform(url = "") {
  try {
    const h = new URL(url).hostname;
    if (/amazon\.(in|com)/.test(h) || /amzn\.(in|to)/.test(h)) return "Amazon";
    if (h.includes("flipkart"))  return "Flipkart";
    if (h.includes("myntra"))    return "Myntra";
    if (h.includes("ajio"))      return "Ajio";
    if (h.includes("meesho"))    return "Meesho";
    if (h.includes("snapdeal"))  return "Snapdeal";
    if (h.includes("nykaa"))     return "Nykaa";
    if (h.includes("tatacliq"))  return "TataCliq";
  } catch { /**/ }
  return "Other";
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

function mapSourceToPlatform(source = "") {
  const s = source.toLowerCase();
  if (s.includes("amazon"))   return "Amazon";
  if (s.includes("flipkart")) return "Flipkart";
  if (s.includes("myntra"))   return "Myntra";
  if (s.includes("ajio"))     return "Ajio";
  if (s.includes("meesho"))   return "Meesho";
  if (s.includes("snapdeal")) return "Snapdeal";
  if (s.includes("nykaa"))    return "Nykaa";
  if (s.includes("tatacliq") || s.includes("tata cliq")) return "TataCliq";
  if (s.includes("croma"))    return "Croma";
  if (s.includes("reliance")) return "Reliance Digital";
  return source;
}

function parsePrice(priceStr = "") {
  const cleaned = String(priceStr).replace(/[^0-9.]/g, "");
  return parseFloat(cleaned) || 0;
}

// ── Step 1: Scrape product page title ────────────────────────────────────────
async function scrapeTitle(url, platform) {
  const cacheKey = `title:${url}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  // For Flipkart: extract from URL slug directly (they block scrapers)
  // URL pattern: /product-name-here/p/itemid
  if (platform === "Flipkart") {
    try {
      const pathname = new URL(url).pathname;
      const segments = pathname.split("/").filter(Boolean);
      // First segment is usually the product slug
      const slug = segments[0] || "";
      if (slug && slug.length > 5 && !["p","dp","product"].includes(slug)) {
        const fromSlug = slug.replace(/-/g, " ").trim();
        cache.set(cacheKey, fromSlug);
        return fromSlug;
      }
    } catch { /**/ }
  }

  try {
    const { data } = await axios.get(url, {
      timeout: 8000,
      headers: {
        "User-Agent": randomUA(),
        "Accept-Language": "en-IN,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    const $ = cheerio.load(data);
    let title = "";

    if (platform === "Amazon") {
      title = $("#productTitle").text().trim() ||
              $("h1.a-size-large").text().trim() ||
              $("span#productTitle").text().trim();
    } else if (platform === "Flipkart") {
      title = $("span.B_NuCI").text().trim() ||
              $("h1._6EBuvT").text().trim() ||
              $("h1.yhB1nd").text().trim() ||
              $("h1").first().text().trim();
    } else if (platform === "Myntra") {
      title = ($("h1.pdp-title").text().trim() + " " + $("h1.pdp-name").text().trim()).trim();
    } else if (platform === "Ajio") {
      title = $("h1.prod-name").text().trim();
    } else {
      title = $("h1").first().text().trim();
    }

    if (!title) title = $("meta[property='og:title']").attr("content") || "";
    if (!title) title = $("title").text().trim();

    // Fallback: URL slug
    if (!title) {
      const seg = url.split("/").filter(Boolean).find(
        s => s.length > 8 && !/^[A-Z0-9]{8,12}$/.test(s) &&
             !["dp","p","product","item","buy"].includes(s.toLowerCase())
      );
      title = seg ? seg.replace(/-/g, " ") : "";
    }

    title = title.trim();
    cache.set(cacheKey, title);
    return title;
  } catch (err) {
    console.error("scrapeTitle error:", err.message);
    // Always fall back to URL slug
    try {
      const pathname = new URL(url).pathname;
      const seg = pathname.split("/").filter(Boolean).find(
        s => s.length > 5 && !["dp","p","product","item","buy"].includes(s.toLowerCase())
      );
      return seg ? seg.replace(/-/g, " ") : "";
    } catch { return ""; }
  }
}

// ── Step 2: Clean title → search query ───────────────────────────────────────
function buildSearchQuery(rawTitle) {
  // If it looks like a URL slug (hyphens, no spaces), convert it
  const isSlug = rawTitle.includes("-") && !rawTitle.includes(" ");
  const text = isSlug ? rawTitle.replace(/-/g, " ") : rawTitle;

  return text
    .replace(/\(.*?\)/g, "")
    .replace(/\[.*?\]/g, "")
    // Remove size/color noise at end
    .replace(/\b(xs|s|m|l|xl|xxl|3xl|4xl|small|medium|large|extra)\b/gi, "")
    .replace(/\b(buy|online|india|free|shipping|new|latest|best|offer|deal|discount|price|review)\b/gi, "")
    // Keep brand + product type — trim to first 8 meaningful words
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 8)
    .join(" ");
}

// ── Step 3: Google Shopping via SerpAPI ──────────────────────────────────────
async function searchGoogleShopping(query) {
  if (!SERPAPI_KEY) {
    console.warn("SERPAPI_KEY not set — skipping Google Shopping search");
    return [];
  }

  const cacheKey = `gshopping:${query}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  try {
    const { data } = await axios.get("https://serpapi.com/search", {
      params: {
        engine:  "google_shopping",
        q:       query,
        gl:      "in",
        hl:      "en",
        api_key: SERPAPI_KEY,
        num:     20,
      },
      timeout: 12000,
    });

    // Prefer sponsored ads (more accurate/exact product) then fall back to organic
    const ads      = data?.ads || [];
    const organic  = data?.shopping_results || [];

    const mapItem = (item, isSponsored = false) => {
      const source   = item.source || item.displayed_link || "";
      const platform = mapSourceToPlatform(source);
      const url      = item.link || item.product_link || "";
      const price    = parsePrice(item.price);
      if (!price || !url) return null;
      return {
        title:         item.title || query,
        price,
        originalPrice: price,
        image:         item.thumbnail || "",
        site:          platform || source,
        url,
        affiliateLink: buildAffiliateLink(url, platform),
        rating:        item.rating || 0,
        reviews:       item.reviews || 0,
        sponsored:     isSponsored,
        source:        "google_shopping",
      };
    };

    const sponsoredResults = ads.map(i => mapItem(i, true)).filter(Boolean);
    const organicResults   = organic.map(i => mapItem(i, false)).filter(Boolean);

    // Keep all sponsored results + dedupe organic by site
    const seenSites = new Set(sponsoredResults.map(p => p.site));
    const filteredOrganic = organicResults.filter(p => {
      if (seenSites.has(p.site)) return false;
      seenSites.add(p.site);
      return true;
    });
    const results = [...sponsoredResults, ...filteredOrganic];

    console.log(`📦 SerpAPI: ${sponsoredResults.length} sponsored + ${organicResults.length} organic = ${results.length} unique for: "${query}"`);
    if (results.length > 0) cache.set(cacheKey, results);
    return results;
  } catch (err) {
    console.error("SerpAPI error:", err.message);
    return [];
  }
}

// ── Main export ───────────────────────────────────────────────────────────────
async function getComparisons(productUrl) {
  const platform = detectPlatform(productUrl);
  const rawTitle = await scrapeTitle(productUrl, platform);

  if (!rawTitle) {
    return { searchTitle: "", comparisons: [], lowestPrice: 0, lowestSite: "" };
  }

  const searchQuery = buildSearchQuery(rawTitle);
  console.log(`🔍 Searching Google Shopping: "${searchQuery}"`);

  const results = await searchGoogleShopping(searchQuery);
  results.sort((a, b) => a.price - b.price);

  return {
    searchTitle:  rawTitle,
    searchQuery,
    comparisons:  results,
    lowestPrice:  results[0]?.price || 0,
    lowestSite:   results[0]?.site  || "",
    totalFound:   results.length,
  };
}

module.exports = { getComparisons, detectPlatform, buildAffiliateLink, scrapeTitle };
