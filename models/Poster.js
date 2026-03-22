const mongoose = require("mongoose");

const posterSchema = new mongoose.Schema({
  title:     { type: String, required: true },
  imageUrl:  { type: String, required: true },
  linkUrl:   { type: String, default: "" },
  active:    { type: Boolean, default: true },
  order:     { type: Number, default: 0 },
  // Sizing & crop
  height:    { type: String, default: "md" },   // sm | md | lg | xl
  objectFit: { type: String, default: "contain" }, // cover | contain | fill
}, { timestamps: true });

module.exports = mongoose.model("Poster", posterSchema);
