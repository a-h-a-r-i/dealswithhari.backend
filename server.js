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
