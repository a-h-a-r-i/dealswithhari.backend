const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  firebaseUid: { type: String, unique: true, sparse: true }, // Google login
  email:       { type: String, required: true, unique: true },
  mobile:      { type: String, default: "" },
  pin:         { type: String, default: "" }, // store hashed in production
  displayName: { type: String, default: "" },
  photoURL:    { type: String, default: "" },
  // Earnings summary (updated when clicks/conversions tracked)
  totalClicks:      { type: Number, default: 0 },
  totalConversions: { type: Number, default: 0 },
  totalEarnings:    { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
