require("dotenv").config();
const express   = require("express");
const cors      = require("cors");
const connectDB = require("./db");

const app  = express();
const PORT = process.env.PORT || 5000;

connectDB();

app.use(cors());
app.use(express.json());

// Routes
app.get("/", (req, res) => res.json({ message: "API running" }));
app.use("/api/auth",    require("./routes/auth"));
app.use("/api/links",   require("./routes/links"));
app.use("/api/compare", require("./routes/compare"));
app.use("/api/search",  require("./routes/search"));
app.use("/api/admin",   require("./routes/admin"));
app.use("/api/offers",  require("./routes/flipkartOffers"));

// Public: active deals & posters for homepage
const Deal   = require("./models/Deal");
const Poster = require("./models/Poster");
app.get("/api/deals",   async (req, res) => { try { const deals   = await Deal.find({ active: true }).sort({ createdAt: -1 }); res.json({ deals }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get("/api/posters", async (req, res) => { try { const posters = await Poster.find({ active: true }).sort({ order: 1 }); res.json({ posters }); } catch (e) { res.status(500).json({ error: e.message }); } });

// Fast URL resolver — follows redirects server-side (handles dl.flipkart.com etc.)
app.post("/api/resolve", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "url required" });
    const { resolveUrl } = require("./lib/googleShopping");
    const resolved = await resolveUrl(url);
    res.json({ resolved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
