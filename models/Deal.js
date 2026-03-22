const mongoose = require("mongoose");

const dealSchema = new mongoose.Schema({
  title:         { type: String, required: true },
  image:         { type: String, default: "" },
  price:         { type: Number, required: true },
  originalPrice: { type: Number, required: true },
  discount:      { type: Number, default: 0 },
  url:           { type: String, required: true },
  platform:      { type: String, default: "other" }, // amazon | flipkart | myntra | other
  category:      { type: String, default: "General" },
  rating:        { type: Number, default: 0 },
  reviews:       { type: Number, default: 0 },
  active:        { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model("Deal", dealSchema);
