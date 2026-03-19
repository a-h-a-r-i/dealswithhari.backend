const mongoose = require("mongoose");

const ProductListingSchema = new mongoose.Schema(
  {
    title:     { type: String, required: true },
    price:     { type: Number, required: true },
    site:      { type: String, required: true, enum: ["Amazon", "Flipkart", "Ajio", "Myntra", "Other"] },
    image:     { type: String, default: "" },
    link:      { type: String, required: true },
    brand:     { type: String, default: "" },
    category:  { type: String, default: "" },
    // Normalized title stored for fast matching
    titleNorm: { type: String, index: true },
    // Which cluster this listing belongs to
    clusterId: { type: mongoose.Schema.Types.ObjectId, ref: "ProductCluster", default: null },
  },
  { timestamps: true }
);

// Auto-normalize title before save
ProductListingSchema.pre("save", function (next) {
  this.titleNorm = normalize(this.title);
  next();
});

function normalize(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = mongoose.model("ProductListing", ProductListingSchema);
