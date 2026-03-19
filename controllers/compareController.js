const ProductListing = require("../models/ProductListing");
const ProductCluster = require("../models/ProductCluster");
const { normalize, scoreProducts, formatCluster } = require("../lib/matcher");

// ── POST /api/compare/products ────────────────────────────────────────────────
// Add one or more product listings. Auto-clusters them.
const addProducts = async (req, res) => {
  try {
    const input = Array.isArray(req.body) ? req.body : [req.body];

    if (!input.length) return res.status(400).json({ error: "No products provided" });

    const saved = [];

    for (const item of input) {
      const { title, price, site, image = "", link, brand = "", category = "" } = item;

      if (!title || price == null || !site || !link) {
        return res.status(400).json({ error: "title, price, site, link are required" });
      }

      const titleNorm = normalize(title);

      // Check for exact duplicate (same site + same normalized title)
      const existing = await ProductListing.findOne({ titleNorm, site });
      if (existing) {
        // Update price if changed
        if (existing.price !== price) {
          existing.price = price;
          await existing.save();
        }
        saved.push(existing);
        continue;
      }

      // Find or create a cluster for this product
      const clusterId = await findOrCreateCluster({ title, titleNorm, brand, category, image });

      const listing = await ProductListing.create({
        title, price, site, image, link, brand, category, titleNorm, clusterId,
      });

      saved.push(listing);
    }

    res.status(201).json({ added: saved.length, products: saved });
  } catch (err) {
    console.error("addProducts error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/compare ──────────────────────────────────────────────────────────
// Return all grouped products (clusters with their listings)
const getCompare = async (req, res) => {
  try {
    const { category, sort = "price" } = req.query;

    const clusterQuery = category ? { category } : {};
    const clusters = await ProductCluster.find(clusterQuery).lean();

    const result = await Promise.all(
      clusters.map(async (cluster) => {
        const listings = await ProductListing.find({ clusterId: cluster._id })
          .select("site price link image")
          .lean();

        if (!listings.length) return null;

        const sorted = listings.sort((a, b) => a.price - b.price);
        return {
          clusterId:   cluster._id,
          productName: cluster.productName,
          brand:       cluster.brand,
          category:    cluster.category,
          image:       cluster.image,
          lowestPrice: sorted[0].price,
          products:    sorted.map((l) => ({ site: l.site, price: l.price, link: l.link, image: l.image })),
        };
      })
    );

    let filtered = result.filter(Boolean);

    // Sort clusters
    if (sort === "price") filtered.sort((a, b) => a.lowestPrice - b.lowestPrice);

    res.json({ count: filtered.length, clusters: filtered });
  } catch (err) {
    console.error("getCompare error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/compare/best-deals ───────────────────────────────────────────────
// Return only the single best (lowest) price per product cluster
const getBestDeals = async (req, res) => {
  try {
    const { category } = req.query;
    const clusterQuery = category ? { category } : {};
    const clusters = await ProductCluster.find(clusterQuery).lean();

    const deals = await Promise.all(
      clusters.map(async (cluster) => {
        const best = await ProductListing.findOne({ clusterId: cluster._id })
          .sort({ price: 1 })
          .select("site price link image")
          .lean();

        if (!best) return null;

        return {
          productName: cluster.productName,
          brand:       cluster.brand,
          category:    cluster.category,
          image:       cluster.image || best.image,
          bestSite:    best.site,
          bestPrice:   best.price,
          bestLink:    best.link,
        };
      })
    );

    const result = deals
      .filter(Boolean)
      .sort((a, b) => a.bestPrice - b.bestPrice);

    res.json({ count: result.length, deals: result });
  } catch (err) {
    console.error("getBestDeals error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/compare/match-test ───────────────────────────────────────────────
// Dev utility: test if two product titles would match
const testMatch = (req, res) => {
  try {
    const { titleA, titleB, brandA = "", brandB = "" } = req.query;
    if (!titleA || !titleB) return res.status(400).json({ error: "titleA and titleB required" });
    const result = scoreProducts(
      { title: titleA, brand: brandA },
      { title: titleB, brand: brandB }
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/compare/search?title=... ────────────────────────────────────────
// Search for similar products by title — used by frontend after link generation
const searchByTitle = async (req, res) => {
  try {
    const { title } = req.query;
    if (!title) return res.status(400).json({ error: "title query param required" });

    const allClusters = await ProductCluster.find().lean();
    const matched = [];

    for (const cluster of allClusters) {
      const { isMatch, score } = scoreProducts(
        { title: cluster.productName, brand: cluster.brand },
        { title, brand: "" }
      );
      if (isMatch) matched.push({ cluster, score });
    }

    // Sort by score descending
    matched.sort((a, b) => b.score - a.score);

    const result = await Promise.all(
      matched.slice(0, 5).map(async ({ cluster }) => {
        const listings = await ProductListing.find({ clusterId: cluster._id })
          .select("site price link image")
          .lean();
        const sorted = listings.sort((a, b) => a.price - b.price);
        return {
          clusterId:   cluster._id,
          productName: cluster.productName,
          brand:       cluster.brand,
          category:    cluster.category,
          image:       cluster.image,
          lowestPrice: sorted[0]?.price ?? null,
          products:    sorted.map((l) => ({ site: l.site, price: l.price, link: l.link, image: l.image })),
        };
      })
    );

    res.json({ count: result.length, clusters: result });
  } catch (err) {
    console.error("searchByTitle error:", err);
    res.status(500).json({ error: err.message });
  }
};
async function findOrCreateCluster({ title, titleNorm, brand, category, image }) {
  // Load all clusters and find a match using scorer
  const allClusters = await ProductCluster.find().lean();

  for (const cluster of allClusters) {
    const { isMatch } = scoreProducts(
      { title: cluster.productName, brand: cluster.brand },
      { title, brand }
    );
    if (isMatch) return cluster._id;
  }

  // No match — create new cluster
  const newCluster = await ProductCluster.create({
    productName: title,
    brand,
    category,
    image,
    titleNorm,
  });

  return newCluster._id;
}

module.exports = { addProducts, getCompare, getBestDeals, testMatch, searchByTitle };
