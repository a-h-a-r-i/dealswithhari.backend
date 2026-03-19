/**
 * matcher.js — Product similarity & matching logic
 * Similar to BuyHatke's approach: normalize → extract keywords → score similarity
 */

// ── Normalization ─────────────────────────────────────────────────────────────

/**
 * Normalize a product title for comparison:
 * lowercase, strip symbols, collapse whitespace
 */
function normalize(str = "") {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Common stop words to ignore during keyword extraction
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "for", "with", "in", "on", "at",
  "of", "to", "by", "is", "it", "this", "that", "from", "pack",
  "combo", "set", "new", "buy", "online", "india", "free", "shipping",
]);

/**
 * Extract meaningful keywords from a normalized title
 */
function extractKeywords(normalizedTitle) {
  return normalizedTitle
    .split(" ")
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

// ── String similarity (Dice coefficient) ─────────────────────────────────────

/**
 * Build bigrams from a string
 */
function bigrams(str) {
  const pairs = new Set();
  for (let i = 0; i < str.length - 1; i++) {
    pairs.add(str.slice(i, i + 2));
  }
  return pairs;
}

/**
 * Dice coefficient similarity between two strings (0–1)
 * Fast, no external dependency needed
 */
function diceSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ba = bigrams(a);
  const bb = bigrams(b);
  if (ba.size === 0 || bb.size === 0) return 0;
  let intersection = 0;
  for (const g of ba) { if (bb.has(g)) intersection++; }
  return (2 * intersection) / (ba.size + bb.size);
}

// ── Keyword overlap score ─────────────────────────────────────────────────────

/**
 * Jaccard similarity on keyword sets (0–1)
 */
function keywordOverlap(kwA, kwB) {
  if (!kwA.length || !kwB.length) return 0;
  const setA = new Set(kwA);
  const setB = new Set(kwB);
  let intersection = 0;
  for (const k of setA) { if (setB.has(k)) intersection++; }
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

// ── Brand matching ────────────────────────────────────────────────────────────

function brandMatches(brandA = "", brandB = "") {
  if (!brandA || !brandB) return false;
  return normalize(brandA) === normalize(brandB);
}

// ── Main match function ───────────────────────────────────────────────────────

/**
 * Returns a score (0–1) and whether the two products are considered a match.
 *
 * Rules:
 *   score > 0.75                    → match
 *   score > 0.60 AND brand matches  → match
 *   otherwise                       → no match
 */
function scoreProducts(productA, productB) {
  const normA = normalize(productA.title);
  const normB = normalize(productB.title);

  const kwA = extractKeywords(normA);
  const kwB = extractKeywords(normB);

  // Weighted combination: 60% dice on full title, 40% keyword overlap
  const dice = diceSimilarity(normA, normB);
  const kw   = keywordOverlap(kwA, kwB);
  const score = dice * 0.6 + kw * 0.4;

  const sameBrand = brandMatches(productA.brand, productB.brand);

  const isMatch =
    score > 0.75 ||
    (score > 0.60 && sameBrand);

  return { score: parseFloat(score.toFixed(4)), isMatch, sameBrand };
}

// ── Cluster grouping ──────────────────────────────────────────────────────────

/**
 * Given an array of product objects, group them into clusters of similar products.
 * Returns an array of clusters, each with a representative name and its listings.
 *
 * @param {Array} products - Array of { title, price, site, image, link, brand, category }
 * @returns {Array} clusters
 */
function groupProducts(products) {
  const clusters = []; // [{ rep: product, listings: [product, ...] }]

  for (const product of products) {
    let placed = false;

    for (const cluster of clusters) {
      const { isMatch } = scoreProducts(cluster.rep, product);
      if (isMatch) {
        cluster.listings.push(product);
        placed = true;
        break;
      }
    }

    if (!placed) {
      clusters.push({ rep: product, listings: [product] });
    }
  }

  return clusters.map((c) => formatCluster(c));
}

/**
 * Format a raw cluster into the API response shape
 */
function formatCluster(cluster) {
  const listings = cluster.listings
    .map((p) => ({
      site:  p.site,
      price: p.price,
      link:  p.link,
      image: p.image || "",
    }))
    .sort((a, b) => a.price - b.price); // sort by price ascending

  const lowestPrice = listings[0]?.price ?? null;

  return {
    productName:  cluster.rep.title,
    brand:        cluster.rep.brand || "",
    category:     cluster.rep.category || "",
    image:        cluster.rep.image || "",
    lowestPrice,
    products:     listings,
  };
}

module.exports = { normalize, extractKeywords, scoreProducts, groupProducts, formatCluster };
