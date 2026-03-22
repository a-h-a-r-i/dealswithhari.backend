const router = require("express").Router();
const User   = require("../models/User");
const Link   = require("../models/Link");
const Deal   = require("../models/Deal");
const Poster = require("../models/Poster");

// Simple secret-key middleware
const ADMIN_SECRET = process.env.ADMIN_SECRET || "dwh_admin_2024";
function auth(req, res, next) {
  const key = req.headers["x-admin-key"] || req.query.key;
  if (key !== ADMIN_SECRET) return res.status(401).json({ error: "Unauthorized" });
  next();
}

// ── Dashboard stats ──────────────────────────────────────────────────────────
router.get("/stats", auth, async (req, res) => {
  try {
    const [totalUsers, totalLinks, totalDeals, totalPosters, recentUsers] = await Promise.all([
      User.countDocuments(),
      Link.countDocuments(),
      Deal.countDocuments({ active: true }),
      Poster.countDocuments({ active: true }),
      User.find().sort({ createdAt: -1 }).limit(5).select("displayName email mobile createdAt photoURL"),
    ]);
    const earningsAgg = await User.aggregate([{ $group: { _id: null, total: { $sum: "$totalEarnings" } } }]);
    const clicksAgg   = await Link.aggregate([{ $group: { _id: null, total: { $sum: "$clicks" } } }]);
    res.json({
      totalUsers, totalLinks, totalDeals, totalPosters,
      totalEarnings: earningsAgg[0]?.total ?? 0,
      totalClicks:   clicksAgg[0]?.total ?? 0,
      recentUsers,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Users ────────────────────────────────────────────────────────────────────
router.get("/users", auth, async (req, res) => {
  try {
    const page  = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || "";
    const query = search
      ? { $or: [{ displayName: new RegExp(search, "i") }, { email: new RegExp(search, "i") }, { mobile: new RegExp(search, "i") }] }
      : {};
    const [users, total] = await Promise.all([
      User.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
        .select("displayName email mobile photoURL totalClicks totalEarnings referralCount createdAt"),
      User.countDocuments(query),
    ]);
    res.json({ users, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/users/:id", auth, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Deals ────────────────────────────────────────────────────────────────────
router.get("/deals", auth, async (req, res) => {
  try {
    const deals = await Deal.find().sort({ createdAt: -1 });
    res.json({ deals });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/deals", auth, async (req, res) => {
  try {
    const { title, image, price, originalPrice, discount, url, platform, category, rating, reviews } = req.body;
    if (!title || !price || !url) return res.status(400).json({ error: "title, price, url required" });
    const deal = await Deal.create({ title, image, price, originalPrice: originalPrice || price, discount: discount || 0, url, platform: platform || "other", category: category || "General", rating: rating || 0, reviews: reviews || 0 });
    res.status(201).json({ deal });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/deals/:id", auth, async (req, res) => {
  try {
    const deal = await Deal.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!deal) return res.status(404).json({ error: "Not found" });
    res.json({ deal });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/deals/:id", auth, async (req, res) => {
  try {
    await Deal.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Posters ──────────────────────────────────────────────────────────────────
router.get("/posters", auth, async (req, res) => {
  try {
    const posters = await Poster.find().sort({ order: 1, createdAt: -1 });
    res.json({ posters });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/posters", auth, async (req, res) => {
  try {
    const { title, imageUrl, linkUrl, order } = req.body;
    if (!title || !imageUrl) return res.status(400).json({ error: "title and imageUrl required" });
    const poster = await Poster.create({ title, imageUrl, linkUrl: linkUrl || "", order: order || 0 });
    res.status(201).json({ poster });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/posters/:id", auth, async (req, res) => {
  try {
    const poster = await Poster.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!poster) return res.status(404).json({ error: "Not found" });
    res.json({ poster });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/posters/:id", auth, async (req, res) => {
  try {
    await Poster.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Login logs (recent pin-logins via users with pin set) ────────────────────
router.get("/logins", auth, async (req, res) => {
  try {
    const users = await User.find({ pin: { $ne: "" } })
      .sort({ updatedAt: -1 }).limit(50)
      .select("displayName email mobile photoURL createdAt updatedAt");
    res.json({ logins: users });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
