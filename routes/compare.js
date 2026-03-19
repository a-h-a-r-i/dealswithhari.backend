const router = require("express").Router();
const {
  addProducts,
  getCompare,
  getBestDeals,
  testMatch,
  searchByTitle,
} = require("../controllers/compareController");

// POST   /api/compare/products   → add product(s)
router.post("/products", addProducts);

// GET    /api/compare            → all grouped clusters
router.get("/", getCompare);

// GET    /api/compare/best-deals → lowest price per product
router.get("/best-deals", getBestDeals);

// GET    /api/compare/search?title=... → search similar products by title
router.get("/search", searchByTitle);

// GET    /api/compare/match-test?titleA=...&titleB=... → dev utility
router.get("/match-test", testMatch);

module.exports = router;
