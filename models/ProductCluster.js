const mongoose = require("mongoose");

// A cluster = one logical product with listings from multiple sites
const ProductClusterSchema = new mongoose.Schema(
  {
    productName: { type: String, required: true },
    brand:       { type: String, default: "" },
    category:    { type: String, default: "" },
    image:       { type: String, default: "" },
    titleNorm:   { type: String, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ProductCluster", ProductClusterSchema);
