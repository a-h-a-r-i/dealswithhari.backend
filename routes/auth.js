const router = require("express").Router();
const User   = require("../models/User");

// ── Upsert user after Google login (called from frontend after Firebase auth) ──
router.post("/google", async (req, res) => {
  try {
    const { firebaseUid, email, displayName, photoURL } = req.body;
    if (!firebaseUid || !email) return res.status(400).json({ error: "Missing fields" });

    let user = await User.findOne({ firebaseUid });
    if (!user) {
      // Also check by email in case they signed up via PIN first
      user = await User.findOne({ email });
      if (user) {
        user.firebaseUid = firebaseUid;
        user.displayName = displayName || user.displayName;
        user.photoURL    = photoURL    || user.photoURL;
        await user.save();
      } else {
        user = await User.create({ firebaseUid, email, displayName, photoURL });
      }
    }
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Save / update mobile + PIN after Google signup ──
router.post("/setup-pin", async (req, res) => {
  try {
    const { firebaseUid, mobile, pin } = req.body;
    if (!firebaseUid || !mobile || !pin) return res.status(400).json({ error: "Missing fields" });

    const user = await User.findOneAndUpdate(
      { firebaseUid },
      { mobile, pin },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Login with mobile/email + PIN ──
router.post("/pin-login", async (req, res) => {
  try {
    const { identifier, pin } = req.body;
    if (!identifier || !pin) return res.status(400).json({ error: "Missing fields" });

    const user = await User.findOne({
      $or: [{ email: identifier }, { mobile: identifier }],
      pin,
    });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Update mobile or PIN ──
router.patch("/update", async (req, res) => {
  try {
    const { firebaseUid, userId, mobile, currentPin, newPin } = req.body;
    const query = firebaseUid ? { firebaseUid } : { _id: userId };
    const user  = await User.findOne(query);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (mobile) user.mobile = mobile;
    if (newPin) {
      if (user.pin && user.pin !== currentPin)
        return res.status(400).json({ error: "Current PIN is incorrect" });
      user.pin = newPin;
    }
    await user.save();
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
