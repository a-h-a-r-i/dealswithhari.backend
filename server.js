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

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
