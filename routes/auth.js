const router = require("express").Router();
const User   = require("../models/User");

// ── Validate a referral code — returns referrer's display name ──
router.get("/validate-referral/:code", async (req, res) => {
  try {
    const user = await User.findOne({ referralCode: req.params.code.toUpperCase() });
    if (!user) return res.status(404).json({ error: "Invalid referral code" });
    res.json({ valid: true, referrerName: user.displayName || user.email.split("@")[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Upsert user after Google login ──
router.post("/google", async (req, res) => {
  try {
    const { firebaseUid, email, displayName, photoURL, referralCode } = req.body;
    if (!firebaseUid || !email) return res.status(400).json({ error: "Missing fields" });

    let user = await User.findOne({ firebaseUid });
    let isNew = false;

    if (!user) {
      user = await User.findOne({ email });
      if (user) {
        user.firebaseUid = firebaseUid;
        user.displayName = displayName || user.displayName;
        user.photoURL    = photoURL    || user.photoURL;
        await user.save();
      } else {
        isNew = true;
        // Resolve referrer
        let referredBy = null;
        if (referralCode) {
          const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
          if (referrer) {
            referredBy = referrer._id;
            await User.findByIdAndUpdate(referrer._id, { $inc: { referralCount: 1 } });
          }
        }
        user = await User.create({ firebaseUid, email, displayName, photoURL, referredBy });
      }
    }

    res.json({ user, isNew });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Save / update mobile + PIN after Google signup ──
router.post("/setup-pin", async (req, res) => {
  try {
    const { firebaseUid, mobile, pin, referralCode } = req.body;
    if (!firebaseUid || !mobile || !pin) return res.status(400).json({ error: "Missing fields" });

    const update = { mobile, pin };

    // Apply referral only if not already referred
    if (referralCode) {
      const self = await User.findOne({ firebaseUid });
      if (self && !self.referredBy) {
        const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
        if (referrer && String(referrer._id) !== String(self._id)) {
          update.referredBy = referrer._id;
          await User.findByIdAndUpdate(referrer._id, { $inc: { referralCount: 1 } });
        }
      }
    }

    const user = await User.findOneAndUpdate({ firebaseUid }, update, { new: true });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Register with mobile + PIN (new user) ──
router.post("/pin-register", async (req, res) => {
  try {
    const { email, mobile, pin, referralCode } = req.body;
    if (!email || !mobile || !pin) return res.status(400).json({ error: "Missing fields" });

    const existing = await User.findOne({ $or: [{ email }, { mobile }] });
    if (existing) return res.status(409).json({ error: "Account already exists" });

    let referredBy = null;
    if (referralCode) {
      const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
      if (referrer) {
        referredBy = referrer._id;
        await User.findByIdAndUpdate(referrer._id, { $inc: { referralCount: 1 } });
      }
    }

    const user = await User.create({ email, mobile, pin, referredBy });
    res.status(201).json({ user });
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
