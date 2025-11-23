// adminAuth.js
const express = require('express');
const router = express.Router();

// 👇 Demo only – in real apps use hash + database
let ADMIN_PASSWORD = 'admin123';  // default password

// POST /api/admin/login
router.post('/login', (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ success: false, message: 'Password required' });
  }

  if (password === ADMIN_PASSWORD) {
    // You could set a session or send a simple flag
    return res.json({ success: true, message: 'Login ok' });
  } else {
    return res.status(401).json({ success: false, message: 'Invalid password' });
  }
});

// POST /api/admin/change-password
router.post('/change-password', (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'Both old and new password required' });
  }

  if (oldPassword !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Old password is wrong' });
  }

  ADMIN_PASSWORD = newPassword; // 👈 update password in memory
  return res.json({ success: true, message: 'Password updated successfully' });
});

module.exports = router;
