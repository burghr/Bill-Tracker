const express = require('express');
const db = require('../database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  const debts = db
    .prepare('SELECT * FROM debts WHERE user_id = ? ORDER BY sort_order ASC NULLS LAST, created_at ASC')
    .all(req.session.userId);
  res.json(debts);
});

router.post('/', (req, res) => {
  const { name, type, original_balance, current_balance, interest_rate, min_payment } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const result = db.prepare(
    `INSERT INTO debts (user_id, name, type, original_balance, current_balance, interest_rate, min_payment)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    req.session.userId,
    name,
    type || 'loan',
    original_balance ?? 0,
    current_balance ?? original_balance ?? 0,
    interest_rate ?? 0,
    min_payment ?? 0
  );

  const debt = db.prepare('SELECT * FROM debts WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(debt);
});

router.put('/reorder', (req, res) => {
  const updates = req.body;
  if (!Array.isArray(updates)) {
    return res.status(400).json({ error: 'Expected an array' });
  }
  const update = db.prepare('UPDATE debts SET sort_order = ? WHERE id = ? AND user_id = ?');
  db.exec('BEGIN');
  try {
    for (const { id, sort_order } of updates) {
      update.run(sort_order, id, req.session.userId);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'Database error' });
  }
  res.json({ message: 'Reordered' });
});

router.put('/:id', (req, res) => {
  const { id } = req.params;

  const existing = db
    .prepare('SELECT * FROM debts WHERE id = ? AND user_id = ?')
    .get(id, req.session.userId);
  if (!existing) {
    return res.status(404).json({ error: 'Debt not found' });
  }

  const { name, type, original_balance, current_balance, interest_rate, min_payment } = req.body;

  db.prepare(
    `UPDATE debts SET
      name = ?,
      type = ?,
      original_balance = ?,
      current_balance = ?,
      interest_rate = ?,
      min_payment = ?
    WHERE id = ? AND user_id = ?`
  ).run(
    name ?? existing.name,
    type ?? existing.type,
    original_balance ?? existing.original_balance,
    current_balance ?? existing.current_balance,
    interest_rate ?? existing.interest_rate,
    min_payment ?? existing.min_payment,
    id,
    req.session.userId
  );

  const updated = db.prepare('SELECT * FROM debts WHERE id = ?').get(id);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;

  const existing = db
    .prepare('SELECT * FROM debts WHERE id = ? AND user_id = ?')
    .get(id, req.session.userId);
  if (!existing) {
    return res.status(404).json({ error: 'Debt not found' });
  }

  db.prepare('DELETE FROM debts WHERE id = ? AND user_id = ?').run(id, req.session.userId);
  res.json({ message: 'Deleted' });
});

module.exports = router;
