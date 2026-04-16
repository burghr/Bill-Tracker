const express = require('express');
const db = require('../database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  const account = db
    .prepare('SELECT * FROM account WHERE user_id = ?')
    .get(req.session.userId);

  if (!account) {
    return res.json({ balance: 0 });
  }
  res.json({ balance: account.balance });
});

router.put('/', (req, res) => {
  const { balance } = req.body;

  if (balance == null || isNaN(Number(balance))) {
    return res.status(400).json({ error: 'Balance must be a number' });
  }

  db.prepare(
    'UPDATE account SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?'
  ).run(Number(balance), req.session.userId);

  res.json({ balance: Number(balance) });
});

module.exports = router;
