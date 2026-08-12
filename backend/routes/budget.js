const express = require('express');
const db = require('../database');
const { requireAuth } = require('../middleware/auth');
const { getHouseholdId, moveToOwnHousehold } = require('../household');

const router = express.Router();

router.use(requireAuth);

const MONTH_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getHousehold(userId) {
  const id = getHouseholdId(userId);
  const household = db.prepare('SELECT * FROM households WHERE id = ?').get(id);
  const members = db
    .prepare(
      `SELECT u.id, u.username FROM household_members hm
       JOIN users u ON u.id = hm.user_id
       WHERE hm.household_id = ? ORDER BY u.username`
    )
    .all(id);
  return { household, members };
}

// ── Household sharing ────────────────────────────────────────────────────────

router.get('/household', (req, res) => {
  const { household, members } = getHousehold(req.session.userId);
  res.json({
    id: household.id,
    name: household.name,
    owner_id: household.owner_id,
    is_owner: household.owner_id === req.session.userId,
    members: members.map((m) => ({ ...m, is_owner: m.id === household.owner_id })),
  });
});

router.post('/household/members', (req, res) => {
  const { household } = getHousehold(req.session.userId);
  if (household.owner_id !== req.session.userId) {
    return res.status(403).json({ error: 'Only the household owner can add members' });
  }

  const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
  if (!username) return res.status(400).json({ error: 'Username is required' });

  const target = db.prepare('SELECT id, username FROM users WHERE username = ?').get(username);
  if (!target) return res.status(404).json({ error: 'No user with that username' });
  if (target.id === req.session.userId) {
    return res.status(400).json({ error: 'You are already in your own household' });
  }

  const targetHouseholdId = getHouseholdId(target.id);
  if (targetHouseholdId === household.id) {
    return res.status(409).json({ error: `${target.username} is already in this household` });
  }

  // Don't strand other people: if the target owns a household that has
  // additional members, they can't be pulled out of it.
  const targetOwns = db.prepare('SELECT id FROM households WHERE owner_id = ?').get(target.id);
  if (targetOwns) {
    const others = db
      .prepare('SELECT COUNT(*) AS n FROM household_members WHERE household_id = ? AND user_id != ?')
      .get(targetOwns.id, target.id).n;
    if (others > 0) {
      return res.status(409).json({
        error: `${target.username} owns a shared household with other members and cannot be added`,
      });
    }
  }

  db.prepare('UPDATE household_members SET household_id = ? WHERE user_id = ?')
    .run(household.id, target.id);

  const { members } = getHousehold(req.session.userId);
  res.status(201).json({ members });
});

router.delete('/household/members/:userId', (req, res) => {
  const { household } = getHousehold(req.session.userId);
  if (household.owner_id !== req.session.userId) {
    return res.status(403).json({ error: 'Only the household owner can remove members' });
  }
  const targetId = Number(req.params.userId);
  if (targetId === req.session.userId) {
    return res.status(400).json({ error: 'The owner cannot be removed from their own household' });
  }
  const membership = db
    .prepare('SELECT household_id FROM household_members WHERE user_id = ?')
    .get(targetId);
  if (!membership || membership.household_id !== household.id) {
    return res.status(404).json({ error: 'That user is not in this household' });
  }
  moveToOwnHousehold(targetId);
  const { members } = getHousehold(req.session.userId);
  res.json({ members });
});

router.post('/household/leave', (req, res) => {
  const { household } = getHousehold(req.session.userId);
  if (household.owner_id === req.session.userId) {
    return res.status(400).json({ error: 'The owner cannot leave their own household' });
  }
  moveToOwnHousehold(req.session.userId);
  res.json({ message: 'Left household' });
});

// ── Categories ───────────────────────────────────────────────────────────────

router.get('/categories', (req, res) => {
  const householdId = getHouseholdId(req.session.userId);
  const includeArchived = req.query.archived === 'true';
  const rows = db
    .prepare(
      `SELECT * FROM budget_categories WHERE household_id = ?
       ${includeArchived ? '' : 'AND archived = 0'}
       ORDER BY sort_order ASC NULLS LAST, name ASC`
    )
    .all(householdId);
  res.json(rows);
});

function validAmount(v) {
  return typeof v === 'number' && isFinite(v) && v >= 0;
}

// Subcategories are one level deep: a valid parent is a top-level, unarchived
// category in the same household.
function validateParent(householdId, parentId, selfId) {
  const parent = db
    .prepare('SELECT * FROM budget_categories WHERE id = ? AND household_id = ?')
    .get(parentId, householdId);
  if (!parent) return 'Parent category not found';
  if (parent.parent_id) return 'Subcategories cannot have their own subcategories';
  if (selfId && parent.id === selfId) return 'A category cannot be its own parent';
  return null;
}

router.post('/categories', (req, res) => {
  const householdId = getHouseholdId(req.session.userId);
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const monthly_amount = req.body.monthly_amount ?? 0;
  const parent_id = req.body.parent_id || null;

  if (!name) return res.status(400).json({ error: 'Name is required' });
  if (!validAmount(monthly_amount)) {
    return res.status(400).json({ error: 'Monthly amount must be a non-negative number' });
  }
  if (parent_id) {
    const err = validateParent(householdId, parent_id, null);
    if (err) return res.status(400).json({ error: err });
  }

  try {
    const result = db
      .prepare('INSERT INTO budget_categories (household_id, name, monthly_amount, parent_id) VALUES (?, ?, ?, ?)')
      .run(householdId, name, monthly_amount, parent_id);
    res.status(201).json(
      db.prepare('SELECT * FROM budget_categories WHERE id = ?').get(result.lastInsertRowid)
    );
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'A category with that name already exists' });
    }
    res.status(500).json({ error: 'Database error' });
  }
});

router.put('/categories/:id', (req, res) => {
  const householdId = getHouseholdId(req.session.userId);
  const existing = db
    .prepare('SELECT * FROM budget_categories WHERE id = ? AND household_id = ?')
    .get(req.params.id, householdId);
  if (!existing) return res.status(404).json({ error: 'Category not found' });

  const name =
    req.body.name !== undefined ? String(req.body.name).trim() : existing.name;
  const monthly_amount =
    req.body.monthly_amount !== undefined ? req.body.monthly_amount : existing.monthly_amount;
  const archived =
    req.body.archived !== undefined ? (req.body.archived ? 1 : 0) : existing.archived;
  const parent_id =
    req.body.parent_id !== undefined ? (req.body.parent_id || null) : existing.parent_id;

  if (!name) return res.status(400).json({ error: 'Name is required' });
  if (!validAmount(monthly_amount)) {
    return res.status(400).json({ error: 'Monthly amount must be a non-negative number' });
  }

  const children = db
    .prepare('SELECT id FROM budget_categories WHERE parent_id = ?')
    .all(existing.id);

  if (parent_id && parent_id !== existing.parent_id) {
    if (children.length > 0) {
      return res.status(400).json({ error: 'A category with subcategories cannot become a subcategory' });
    }
    const err = validateParent(householdId, parent_id, existing.id);
    if (err) return res.status(400).json({ error: err });
  }

  // A subcategory can't be unarchived while its parent is archived
  // (it would be invisible on the Budget page).
  if (!archived && existing.archived && parent_id) {
    const parent = db.prepare('SELECT archived FROM budget_categories WHERE id = ?').get(parent_id);
    if (parent && parent.archived) {
      return res.status(400).json({ error: 'Restore the parent category first' });
    }
  }

  try {
    db.prepare(
      'UPDATE budget_categories SET name = ?, monthly_amount = ?, archived = ?, parent_id = ? WHERE id = ?'
    ).run(name, monthly_amount, archived, parent_id, existing.id);
    // Archiving a parent hides the whole group, so archive the children with it
    if (archived && !existing.archived && children.length > 0) {
      db.prepare('UPDATE budget_categories SET archived = 1 WHERE parent_id = ?').run(existing.id);
    }
    res.json(db.prepare('SELECT * FROM budget_categories WHERE id = ?').get(existing.id));
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'A category with that name already exists' });
    }
    res.status(500).json({ error: 'Database error' });
  }
});

// Categories with history are archived instead of deleted so past months
// keep their reports intact. Deleting a parent applies to the whole group.
router.delete('/categories/:id', (req, res) => {
  const householdId = getHouseholdId(req.session.userId);
  const existing = db
    .prepare('SELECT * FROM budget_categories WHERE id = ? AND household_id = ?')
    .get(req.params.id, householdId);
  if (!existing) return res.status(404).json({ error: 'Category not found' });

  const groupIds = [
    existing.id,
    ...db.prepare('SELECT id FROM budget_categories WHERE parent_id = ?').all(existing.id).map((r) => r.id),
  ];
  const placeholders = groupIds.map(() => '?').join(',');

  const used = db
    .prepare(`SELECT COUNT(*) AS n FROM budget_transactions WHERE category_id IN (${placeholders})`)
    .get(...groupIds).n;

  if (used > 0) {
    db.prepare(`UPDATE budget_categories SET archived = 1 WHERE id IN (${placeholders})`).run(...groupIds);
    return res.json({ archived: true });
  }
  db.prepare('DELETE FROM budget_categories WHERE parent_id = ?').run(existing.id);
  db.prepare('DELETE FROM budget_categories WHERE id = ?').run(existing.id);
  res.json({ deleted: true });
});

// ── Transactions ─────────────────────────────────────────────────────────────

router.get('/transactions', (req, res) => {
  const householdId = getHouseholdId(req.session.userId);
  const month = req.query.month || currentPeriod();
  if (!MONTH_RE.test(month)) return res.status(400).json({ error: 'month must be YYYY-MM' });

  const rows = db
    .prepare(
      `SELECT t.*, c.name AS category_name, pc.name AS parent_category_name,
              u.username AS entered_by_username
       FROM budget_transactions t
       JOIN budget_categories c ON c.id = t.category_id
       LEFT JOIN budget_categories pc ON pc.id = c.parent_id
       JOIN users u ON u.id = t.entered_by
       WHERE t.household_id = ? AND t.date >= ? || '-01' AND t.date <= ? || '-31'
       ORDER BY t.date DESC, t.id DESC`
    )
    .all(householdId, month, month);
  res.json(rows);
});

function validateTransaction(householdId, body) {
  if (!body.date || !DATE_RE.test(body.date)) return 'Date must be YYYY-MM-DD';
  if (typeof body.amount !== 'number' || !isFinite(body.amount) || body.amount <= 0) {
    return 'Amount must be a positive number';
  }
  const cat = db
    .prepare('SELECT id FROM budget_categories WHERE id = ? AND household_id = ?')
    .get(body.category_id, householdId);
  if (!cat) return 'Invalid category';
  return null;
}

const FETCH_TX = `
  SELECT t.*, c.name AS category_name, pc.name AS parent_category_name,
         u.username AS entered_by_username
  FROM budget_transactions t
  JOIN budget_categories c ON c.id = t.category_id
  LEFT JOIN budget_categories pc ON pc.id = c.parent_id
  JOIN users u ON u.id = t.entered_by
  WHERE t.id = ?`;

router.post('/transactions', (req, res) => {
  const householdId = getHouseholdId(req.session.userId);
  const err = validateTransaction(householdId, req.body);
  if (err) return res.status(400).json({ error: err });

  const { date, amount, category_id, description } = req.body;
  const result = db
    .prepare(
      `INSERT INTO budget_transactions (household_id, category_id, date, amount, description, entered_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(householdId, category_id, date, amount, String(description || ''), req.session.userId);

  res.status(201).json(db.prepare(FETCH_TX).get(result.lastInsertRowid));
});

router.put('/transactions/:id', (req, res) => {
  const householdId = getHouseholdId(req.session.userId);
  const existing = db
    .prepare('SELECT * FROM budget_transactions WHERE id = ? AND household_id = ?')
    .get(req.params.id, householdId);
  if (!existing) return res.status(404).json({ error: 'Transaction not found' });

  const merged = {
    date: req.body.date ?? existing.date,
    amount: req.body.amount ?? existing.amount,
    category_id: req.body.category_id ?? existing.category_id,
    description:
      req.body.description !== undefined ? String(req.body.description) : existing.description,
  };
  const err = validateTransaction(householdId, merged);
  if (err) return res.status(400).json({ error: err });

  db.prepare(
    'UPDATE budget_transactions SET date = ?, amount = ?, category_id = ?, description = ? WHERE id = ?'
  ).run(merged.date, merged.amount, merged.category_id, merged.description, existing.id);

  res.json(db.prepare(FETCH_TX).get(existing.id));
});

router.delete('/transactions/:id', (req, res) => {
  const householdId = getHouseholdId(req.session.userId);
  const result = db
    .prepare('DELETE FROM budget_transactions WHERE id = ? AND household_id = ?')
    .run(req.params.id, householdId);
  if (result.changes === 0) return res.status(404).json({ error: 'Transaction not found' });
  res.json({ deleted: true });
});

// ── Monthly summary (budget vs actual + pacing) ──────────────────────────────

function monthlyPaycheckAmount(pc) {
  const m = { monthly: 1, twice_monthly: 2, biweekly: 26 / 12, weekly: 52 / 12 };
  return pc.amount * (m[pc.schedule_type] || 1);
}

router.get('/summary', (req, res) => {
  const householdId = getHouseholdId(req.session.userId);
  const month = req.query.month || currentPeriod();
  if (!MONTH_RE.test(month)) return res.status(400).json({ error: 'month must be YYYY-MM' });

  const [year, mon] = month.split('-').map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const now = new Date();
  const nowPeriod = currentPeriod();

  // Fraction of the month elapsed: past months are fully elapsed,
  // future months not at all. Drives the "should be at $X by today" pace line.
  let paceFraction;
  if (month < nowPeriod) paceFraction = 1;
  else if (month > nowPeriod) paceFraction = 0;
  else paceFraction = now.getDate() / daysInMonth;

  const spentRows = db
    .prepare(
      `SELECT category_id, SUM(amount) AS spent, COUNT(*) AS tx_count
       FROM budget_transactions
       WHERE household_id = ? AND date >= ? || '-01' AND date <= ? || '-31'
       GROUP BY category_id`
    )
    .all(householdId, month, month);
  const spentByCat = new Map(spentRows.map((r) => [r.category_id, r]));

  // Include archived categories only when they have activity this month,
  // so old months still report correctly after a category is retired.
  const categoryRows = db
    .prepare(
      'SELECT * FROM budget_categories WHERE household_id = ? ORDER BY sort_order ASC NULLS LAST, name ASC'
    )
    .all(householdId);

  // One level of nesting: children roll up into their parent, which holds the
  // shared budget. A child's own monthly_amount is an optional sub-limit.
  const spentOf = (id) => spentByCat.get(id) || { spent: 0, tx_count: 0 };
  const categories = [];
  for (const c of categoryRows) {
    if (c.parent_id) continue;

    const childRows = categoryRows.filter((k) => k.parent_id === c.id);
    const children = [];
    let childActual = 0;
    let childTxCount = 0;
    for (const k of childRows) {
      const s = spentOf(k.id);
      childActual += s.spent;
      childTxCount += s.tx_count;
      if (k.archived && s.spent === 0) continue;
      children.push({
        id: k.id,
        name: k.name,
        archived: !!k.archived,
        budgeted: k.monthly_amount,
        actual: s.spent,
        tx_count: s.tx_count,
      });
    }

    const own = spentOf(c.id);
    const actual = own.spent + childActual;
    if (c.archived && actual === 0) continue;

    categories.push({
      id: c.id,
      name: c.name,
      archived: !!c.archived,
      budgeted: c.monthly_amount,
      actual,
      own_actual: own.spent,
      remaining: c.monthly_amount - actual,
      expected_to_date: c.monthly_amount * paceFraction,
      tx_count: own.tx_count + childTxCount,
      children,
    });
  }

  // Income = monthly-equivalent paychecks across all household members.
  const paychecks = db
    .prepare(
      `SELECT p.* FROM paychecks p
       JOIN household_members hm ON hm.user_id = p.user_id
       WHERE hm.household_id = ?`
    )
    .all(householdId);
  const monthlyIncome = paychecks.reduce((s, p) => s + monthlyPaycheckAmount(p), 0);

  const sum = (key) => categories.reduce((s, c) => s + c[key], 0);

  res.json({
    month,
    days_in_month: daysInMonth,
    day_of_month: month === nowPeriod ? now.getDate() : null,
    pace_fraction: paceFraction,
    categories,
    totals: {
      budgeted: sum('budgeted'),
      actual: sum('actual'),
      remaining: sum('remaining'),
      expected_to_date: sum('expected_to_date'),
    },
    monthly_income: monthlyIncome,
  });
});

module.exports = router;
