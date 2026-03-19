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

// ── Resolve short/redirect URLs to real web URLs ─────────────────────────────
async function resolveUrl(url) {
  try {
    let current = url;

    for (let i = 0; i < 10; i++) {
      let res;
      try {
        res = await axios.get(current, {
          timeout: 10000,
          maxRedirects: 0,
          validateStatus: () => true,
          headers: {
            // Desktop UA — forces web redirect instead of app deep link
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-IN,en;q=0.9",
          },
        });
      } catch { break; }

      const location = res.headers?.location || "";

      // Stop if we hit an app deep link — try to extract web URL from it
      if (/^(intent|fk-app|flipkart-app):\/\//i.test(location)) {
        // intent://... often contains the real URL in S.browser_fallback_url param
        const fallback = location.match(/browser_fallback_url=([^;]+)/);
        if (fallback) {
          current = decodeURIComponent(fallback[1]);
        }
        break;
      }

      if ([301, 302, 303, 307, 308].includes(res.status) && location) {
        current = location.startsWith("http") ? location : new URL(location, current).toString();
        continue;
      }

      // If we got a 200 with HTML, check for meta refresh or canonical
      if (res.status === 200 && res.data) {
        const $ = cheerio.load(res.data);
        const canonical = $("link[rel='canonical']").attr("href") || "";
        const metaRefresh = $("meta[http-equiv='refresh']").attr("content") || "";
        const refreshUrl = metaRefresh.match(/url=(.+)/i)?.[1] || "";
        if (canonical && canonical.startsWith("http") && canonical !== current) {
          current = canonical;
        } else if (refreshUrl) {
          current = refreshUrl.startsWith("http") ? refreshUrl : new URL(refreshUrl, current).toString();
          continue;
        }
      }
      break;
    }

    return current;
  } catch {
    return url;
  }
}

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

// ── Step 1: Extract product title from resolved URL ──────────────────────────
async function scrapeTitle(url, platform) {
  const cacheKey = `title:${url}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  // For Flipkart: URL slug is reliable — format is /product-name-here/p/itemId
  if (platform === "Flipkart") {
    try {
      const pathname = new URL(url).pathname; // e.g. /rare-rabbit-men-shirt/p/itm123
      const segments = pathname.split("/").filter(Boolean);
      // Find the slug segment — it's the one before /p/
      const pIdx = segments.findIndex(s => s === "p");
      const slug = pIdx > 0 ? segments[pIdx - 1] : segments[0];
      if (slug && slug.length > 5 && !/^itm/i.test(slug)) {
        const title = slug.replace(/-/g, " ").trim();
        cache.set(cacheKey, title);
        return title;
      }
    } catch { /**/ }
  }

  // For Amazon: try to scrape (they usually allow it)
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
              $("span#productTitle").text().trim() ||
              $("h1.a-size-large").text().trim();
    } else if (platform === "Myntra") {
      title = ($("h1.pdp-title").text().trim() + " " + $("h1.pdp-name").text().trim()).trim();
    } else if (platform === "Ajio") {
      title = $("h1.prod-name").text().trim();
    } else {
      title = $("h1").first().text().trim();
    }

    if (!title) title = $("meta[property='og:title']").attr("content") || "";
    if (!title) title = $("title").text().replace(/[-|].*$/, "").trim(); // strip site name

    title = title.trim();
    if (title) { cache.set(cacheKey, title); return title; }
  } catch { /**/ }

  // Final fallback: best slug from URL path
  try {
    const pathname = new URL(url).pathname;
    const seg = pathname.split("/").filter(Boolean).find(
      s => s.length > 8 && !/^(itm|dp|B0)[A-Z0-9]+$/i.test(s) &&
           !["p","dp","product","item","buy","s"].includes(s.toLowerCase())
    );
    return seg ? seg.replace(/-/g, " ").trim() : "";
  } catch { return ""; }
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
  // Always try to resolve redirects (handles short links, app links, etc.)
  const resolvedUrl = await resolveUrl(productUrl);
  console.log(`🔗 Input:    ${productUrl}`);
  console.log(`🔗 Resolved: ${resolvedUrl}`);

  const platform = detectPlatform(resolvedUrl);
  const rawTitle = await scrapeTitle(resolvedUrl, platform);

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
