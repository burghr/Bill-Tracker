const express = require('express');
const db = require('../database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  const paychecks = db
    .prepare('SELECT * FROM paychecks WHERE user_id = ? ORDER BY created_at ASC')
    .all(req.session.userId);
  res.json(paychecks);
});

router.post('/', (req, res) => {
  const { name, schedule_type, amount, anchor_date } = req.body;

  if (!name || !schedule_type) {
    return res.status(400).json({ error: 'Name and schedule_type are required' });
  }

  const validSchedules = ['twice_monthly', 'weekly', 'biweekly', 'monthly'];
  if (!validSchedules.includes(schedule_type)) {
    return res.status(400).json({ error: 'Invalid schedule_type' });
  }

  if (schedule_type === 'biweekly' && !anchor_date) {
    return res.status(400).json({ error: 'anchor_date is required for biweekly schedule' });
  }

  const result = db
    .prepare('INSERT INTO paychecks (user_id, name, schedule_type, amount, anchor_date) VALUES (?, ?, ?, ?, ?)')
    .run(req.session.userId, name, schedule_type, amount || 0, anchor_date || null);

  const paycheck = db.prepare('SELECT * FROM paychecks WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(paycheck);
});

router.put('/:id', (req, res) => {
  const { name, schedule_type, amount, anchor_date } = req.body;
  const { id } = req.params;

  const existing = db
    .prepare('SELECT * FROM paychecks WHERE id = ? AND user_id = ?')
    .get(id, req.session.userId);
  if (!existing) {
    return res.status(404).json({ error: 'Paycheck not found' });
  }

  const newSchedule = schedule_type ?? existing.schedule_type;
  const newAnchor = anchor_date !== undefined ? (anchor_date || null) : existing.anchor_date;

  if (newSchedule === 'biweekly' && !newAnchor) {
    return res.status(400).json({ error: 'anchor_date is required for biweekly schedule' });
  }

  db.prepare(
    'UPDATE paychecks SET name = ?, schedule_type = ?, amount = ?, anchor_date = ? WHERE id = ? AND user_id = ?'
  ).run(
    name ?? existing.name,
    newSchedule,
    amount ?? existing.amount,
    newAnchor,
    id,
    req.session.userId
  );

  const updated = db.prepare('SELECT * FROM paychecks WHERE id = ?').get(id);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;

  const existing = db
    .prepare('SELECT * FROM paychecks WHERE id = ? AND user_id = ?')
    .get(id, req.session.userId);
  if (!existing) {
    return res.status(404).json({ error: 'Paycheck not found' });
  }

  db.prepare('DELETE FROM paychecks WHERE id = ? AND user_id = ?').run(id, req.session.userId);
  res.json({ message: 'Deleted' });
});

module.exports = router;
