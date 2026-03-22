const mongoose = require("mongoose");

const linkSchema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  originalUrl:   { type: String, required: true },
  affiliateLink: { type: String, required: true },
  shortLink:     { type: String, default: null },
  platform:      { type: String, default: "Other" },
  // Product metadata
  productTitle:  { type: String, default: "" },
  productImage:  { type: String, default: "" },
  productPrice:  { type: Number, default: 0 },
  // Analytics
  clicks:        { type: Number, default: 0 },
  conversions:   { type: Number, default: 0 },
  earnings:      { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model("Link", linkSchema);
