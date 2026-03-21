const mongoose = require("mongoose");

// Generate a unique 8-char alphanumeric referral code
function generateCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase() +
         Math.random().toString(36).substring(2, 6).toUpperCase();
}

const userSchema = new mongoose.Schema({
  firebaseUid:  { type: String, unique: true, sparse: true },
  email:        { type: String, required: true, unique: true },
  mobile:       { type: String, default: "" },
  pin:          { type: String, default: "" },
  displayName:  { type: String, default: "" },
  photoURL:     { type: String, default: "" },
  // Referral
  referralCode: { type: String, unique: true, sparse: true },
  referredBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  referralCount:{ type: Number, default: 0 },
  // Earnings
  totalClicks:      { type: Number, default: 0 },
  totalConversions: { type: Number, default: 0 },
  totalEarnings:    { type: Number, default: 0 },
}, { timestamps: true });

// Auto-generate unique referral code before save
userSchema.pre("save", async function (next) {
  if (!this.referralCode) {
    let code, exists = true;
    while (exists) {
      code = generateCode();
      exists = await mongoose.model("User").exists({ referralCode: code });
    }
    this.referralCode = code;
  }
  next();
});

module.exports = mongoose.model("User", userSchema);
