const express = require('express');
const { randomUUID } = require('node:crypto');
const db = require('../database');
const { requireAuth } = require('../middleware/auth');
const { getHouseholdId } = require('../household');

const router = express.Router();

router.use(requireAuth);

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function addMonths(period, n) {
  const [y, m] = period.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

// Extend any recurring bill groups that don't yet have rows through targetPeriod.
// Called on every GET so bills grow forward indefinitely as time passes.
function extendRecurringBills(userId, targetPeriod) {
  const groups = db.prepare(
    'SELECT group_id, MAX(period) AS max_period FROM bills WHERE user_id = ? AND group_id IS NOT NULL GROUP BY group_id'
  ).all(userId);

  if (groups.length === 0) return;

  const insert = db.prepare(
    'INSERT INTO bills (user_id, name, amount, paycheck_id, due_date, recurrence, period, group_id, debt_id, is_autopay, pay_on, budget_category_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  for (const { group_id, max_period } of groups) {
    if (max_period >= targetPeriod) continue;

    const template = db.prepare(
      'SELECT * FROM bills WHERE group_id = ? AND period = ? LIMIT 1'
    ).get(group_id, max_period);
    if (!template) continue;

    const step = template.recurrence === 'yearly' ? 12 : 1;
    let period = max_period;
    while (true) {
      period = addMonths(period, step);
      if (period > targetPeriod) break;
      insert.run(
        template.user_id,
        template.name,
        template.amount,
        template.paycheck_id,
        template.due_date,
        template.recurrence,
        period,
        group_id,
        template.debt_id,
        template.is_autopay || 0,
        template.pay_on || null,
        template.budget_category_id || null
      );
    }
  }
}

// Compute the effective pay date for a bill row by combining its period (YYYY-MM)
// with the day-of-month from pay_on, clamped to the month's last day so a
// "pay on the 31st" bill still fires in February. Returns YYYY-MM-DD or null.
function effectivePayDate(bill) {
  if (!bill.pay_on || !bill.period) return null;
  const day = Number(bill.pay_on.slice(-2));
  if (!day) return null;
  const [y, m] = bill.period.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${bill.period}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

// Pick a date for the auto-created budget transaction. Paying inside the
// bill's own month uses today; paying late (or early) pins the transaction to
// the bill's month so it counts against the right month's budget.
function budgetTxDate(bill) {
  const today = new Date().toISOString().slice(0, 10);
  if (!bill.period || today.slice(0, 7) === bill.period) return today;
  if (bill.due_date && bill.due_date.slice(0, 7) === bill.period) return bill.due_date;
  return `${bill.period}-01`;
}

// Record a paid bill as spending in its linked budget category.
// Must run inside the caller's transaction.
function createBudgetTxForBill(bill, categoryId, amount, enteredBy) {
  const category = db.prepare('SELECT * FROM budget_categories WHERE id = ?').get(categoryId);
  if (!category) return;
  // A bill can only ever back one transaction
  db.prepare('DELETE FROM budget_transactions WHERE bill_id = ?').run(bill.id);
  db.prepare(
    `INSERT INTO budget_transactions (household_id, category_id, date, amount, description, entered_by, bill_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(category.household_id, category.id, budgetTxDate(bill), amount, bill.name, enteredBy, bill.id);
}

function applyAutopaySweep(userId) {
  const today = new Date().toISOString().slice(0, 10);
  const candidates = db.prepare(
    `SELECT * FROM bills WHERE user_id = ? AND is_autopay = 1 AND is_paid = 0 AND pay_on IS NOT NULL`
  ).all(userId);

  for (const bill of candidates) {
    const payDate = effectivePayDate(bill);
    if (!payDate || payDate > today) continue;

    db.exec('BEGIN');
    try {
      if (bill.debt_id) {
        const debt = db.prepare('SELECT * FROM debts WHERE id = ? AND user_id = ?')
          .get(bill.debt_id, userId);
        if (debt) {
          const monthlyInterest = debt.current_balance * (debt.interest_rate / 100 / 12);
          const principal = Math.max(0, bill.amount - monthlyInterest);
          db.prepare('UPDATE debts SET current_balance = MAX(0, current_balance - ?) WHERE id = ?')
            .run(principal, debt.id);
          db.prepare('UPDATE bills SET principal_paid = ? WHERE id = ?').run(principal, bill.id);
        }
      }
      if (bill.budget_category_id) {
        createBudgetTxForBill(bill, bill.budget_category_id, bill.amount, userId);
      }
      db.prepare('UPDATE bills SET is_paid = 1 WHERE id = ?').run(bill.id);
      db.prepare(
        'UPDATE account SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?'
      ).run(bill.amount, userId);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
    }
  }
}

function buildPeriods(start, recurrence) {
  const [y, m] = start.split('-').map(Number);
  if (recurrence === 'once') return [start];
  if (recurrence === 'yearly')
    return Array.from({ length: 5 }, (_, i) => `${y + i}-${String(m).padStart(2, '0')}`);
  // monthly / weekly / biweekly → 24 consecutive months
  return Array.from({ length: 24 }, (_, i) => {
    const mo = ((m - 1 + i) % 12) + 1;
    const yr = y + Math.floor((m - 1 + i) / 12);
    return `${yr}-${String(mo).padStart(2, '0')}`;
  });
}

router.get('/', (req, res) => {
  // Auto-extend recurring bills so they always reach 24 months ahead
  extendRecurringBills(req.session.userId, addMonths(currentPeriod(), 24));
  applyAutopaySweep(req.session.userId);

  const bills = db
    .prepare(`
      SELECT b.*, p.name AS paycheck_name, bc.name AS budget_category_name
      FROM bills b
      LEFT JOIN paychecks p ON b.paycheck_id = p.id
      LEFT JOIN budget_categories bc ON b.budget_category_id = bc.id
      WHERE b.user_id = ?
      ORDER BY b.period ASC, b.sort_order ASC NULLS LAST, b.created_at ASC
    `)
    .all(req.session.userId);
  res.json(bills);
});

// A bill may only link to a budget category in the user's own household.
function validBudgetCategory(userId, categoryId) {
  const householdId = getHouseholdId(userId);
  return !!db
    .prepare('SELECT id FROM budget_categories WHERE id = ? AND household_id = ?')
    .get(categoryId, householdId);
}

router.post('/', (req, res) => {
  const { name, amount, paycheck_id, due_date, recurrence, start_period, debt_id, is_autopay, pay_on, budget_category_id } = req.body;

  if (!name || amount == null) {
    return res.status(400).json({ error: 'Name and amount are required' });
  }

  if (paycheck_id) {
    const paycheck = db
      .prepare('SELECT id FROM paychecks WHERE id = ? AND user_id = ?')
      .get(paycheck_id, req.session.userId);
    if (!paycheck) {
      return res.status(400).json({ error: 'Invalid paycheck_id' });
    }
  }

  if (budget_category_id && !validBudgetCategory(req.session.userId, budget_category_id)) {
    return res.status(400).json({ error: 'Invalid budget_category_id' });
  }

  const rec = recurrence || 'monthly';
  const startPeriod = start_period || currentPeriod();
  const periods = buildPeriods(startPeriod, rec);
  const groupId = periods.length > 1 ? randomUUID() : null;

  const insert = db.prepare(
    'INSERT INTO bills (user_id, name, amount, paycheck_id, due_date, recurrence, period, group_id, debt_id, is_autopay, pay_on, budget_category_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const fetchBill = db.prepare(`
    SELECT b.*, p.name AS paycheck_name, bc.name AS budget_category_name
    FROM bills b
    LEFT JOIN paychecks p ON b.paycheck_id = p.id
    LEFT JOIN budget_categories bc ON b.budget_category_id = bc.id
    WHERE b.id = ?
  `);

  const createdBills = [];
  db.exec('BEGIN');
  try {
    for (const period of periods) {
      const result = insert.run(
        req.session.userId,
        name,
        amount,
        paycheck_id || null,
        due_date || null,
        rec,
        period,
        groupId,
        debt_id || null,
        is_autopay ? 1 : 0,
        pay_on || null,
        budget_category_id || null
      );
      createdBills.push(fetchBill.get(result.lastInsertRowid));
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'Database error' });
  }

  res.status(201).json(createdBills);
});

// Mark every paid bill in a period unpaid in one transaction, reversing
// debt principal reductions and restoring the account balance.
router.post('/reset-period', (req, res) => {
  const { period } = req.body;
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: 'period must be YYYY-MM' });
  }

  const paidBills = db
    .prepare('SELECT * FROM bills WHERE user_id = ? AND period = ? AND is_paid = 1')
    .all(req.session.userId, period);

  db.exec('BEGIN');
  try {
    let refund = 0;
    for (const bill of paidBills) {
      refund += bill.amount;
      if (bill.debt_id && bill.principal_paid != null) {
        db.prepare('UPDATE debts SET current_balance = current_balance + ? WHERE id = ? AND user_id = ?')
          .run(bill.principal_paid, bill.debt_id, req.session.userId);
      }
    }
    db.prepare(
      `DELETE FROM budget_transactions WHERE bill_id IN
       (SELECT id FROM bills WHERE user_id = ? AND period = ? AND is_paid = 1)`
    ).run(req.session.userId, period);
    db.prepare('UPDATE bills SET is_paid = 0, principal_paid = NULL WHERE user_id = ? AND period = ? AND is_paid = 1')
      .run(req.session.userId, period);
    if (refund !== 0) {
      db.prepare('UPDATE account SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
        .run(refund, req.session.userId);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'Database error' });
  }

  res.json({ reset: paidBills.length });
});

router.put('/reorder', (req, res) => {
  const updates = req.body; // [{ id, sort_order }]
  if (!Array.isArray(updates)) {
    return res.status(400).json({ error: 'Expected an array' });
  }
  const update = db.prepare(
    'UPDATE bills SET sort_order = ? WHERE id = ? AND user_id = ?'
  );
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
  const { name, amount, paycheck_id, due_date, recurrence, is_paid, debt_id, is_autopay, pay_on, budget_category_id } = req.body;

  const existing = db
    .prepare('SELECT * FROM bills WHERE id = ? AND user_id = ?')
    .get(id, req.session.userId);
  if (!existing) {
    return res.status(404).json({ error: 'Bill not found' });
  }

  const newIsPaid = is_paid != null ? (is_paid ? 1 : 0) : existing.is_paid;
  const newAmount = amount ?? existing.amount;
  const newDebtId = debt_id !== undefined ? (debt_id || null) : existing.debt_id;
  const newBudgetCategoryId =
    budget_category_id !== undefined ? (budget_category_id || null) : existing.budget_category_id;

  if (newBudgetCategoryId && newBudgetCategoryId !== existing.budget_category_id
      && !validBudgetCategory(req.session.userId, newBudgetCategoryId)) {
    return res.status(400).json({ error: 'Invalid budget_category_id' });
  }

  let balanceDelta = 0;
  if (existing.is_paid === 0 && newIsPaid === 1) {
    balanceDelta = -newAmount;
  } else if (existing.is_paid === 1 && newIsPaid === 0) {
    balanceDelta = existing.amount;
  }

  db.exec('BEGIN');
  try {
    // Marking paid with linked debt → split into interest + principal
    if (existing.debt_id && existing.is_paid === 0 && newIsPaid === 1) {
      const debt = db.prepare('SELECT * FROM debts WHERE id = ? AND user_id = ?')
        .get(existing.debt_id, req.session.userId);
      if (debt) {
        const monthlyInterest = debt.current_balance * (debt.interest_rate / 100 / 12);
        const principal = Math.max(0, newAmount - monthlyInterest);
        db.prepare('UPDATE debts SET current_balance = MAX(0, current_balance - ?) WHERE id = ?')
          .run(principal, debt.id);
        db.prepare('UPDATE bills SET principal_paid = ? WHERE id = ?').run(principal, id);
      }
    }

    // Marking unpaid with stored principal_paid → reverse the principal reduction
    if (existing.debt_id && existing.is_paid === 1 && newIsPaid === 0 && existing.principal_paid != null) {
      db.prepare('UPDATE debts SET current_balance = current_balance + ? WHERE id = ? AND user_id = ?')
        .run(existing.principal_paid, existing.debt_id, req.session.userId);
      db.prepare('UPDATE bills SET principal_paid = NULL WHERE id = ?').run(id);
    }

    // Budget link: paying creates a transaction in the linked category,
    // unpaying removes it again.
    if (existing.is_paid === 0 && newIsPaid === 1 && newBudgetCategoryId) {
      createBudgetTxForBill(existing, newBudgetCategoryId, newAmount, req.session.userId);
    }
    if (existing.is_paid === 1 && newIsPaid === 0) {
      db.prepare('DELETE FROM budget_transactions WHERE bill_id = ?').run(existing.id);
    }
    // Still paid but amount/category changed → keep the transaction in sync
    if (existing.is_paid === 1 && newIsPaid === 1) {
      if (!newBudgetCategoryId) {
        db.prepare('DELETE FROM budget_transactions WHERE bill_id = ?').run(existing.id);
      } else if (newBudgetCategoryId !== existing.budget_category_id || newAmount !== existing.amount) {
        createBudgetTxForBill(existing, newBudgetCategoryId, newAmount, req.session.userId);
      }
    }

    const newPaycheckId = paycheck_id !== undefined ? (paycheck_id || null) : existing.paycheck_id;

    // If update_group is set, apply paycheck change to all bills in the group
    if (req.body.update_group && existing.group_id) {
      db.prepare('UPDATE bills SET paycheck_id = ? WHERE group_id = ? AND user_id = ?')
        .run(newPaycheckId, existing.group_id, req.session.userId);
    }

    const newIsAutopay = is_autopay != null ? (is_autopay ? 1 : 0) : existing.is_autopay;
    const newPayOn = pay_on !== undefined ? (pay_on || null) : existing.pay_on;

    db.prepare(
      `UPDATE bills SET
        name = ?,
        amount = ?,
        paycheck_id = ?,
        due_date = ?,
        recurrence = ?,
        is_paid = ?,
        debt_id = ?,
        is_autopay = ?,
        pay_on = ?,
        budget_category_id = ?
      WHERE id = ? AND user_id = ?`
    ).run(
      name ?? existing.name,
      newAmount,
      newPaycheckId,
      due_date !== undefined ? (due_date || null) : existing.due_date,
      recurrence ?? existing.recurrence,
      newIsPaid,
      newDebtId,
      newIsAutopay,
      newPayOn,
      newBudgetCategoryId,
      id,
      req.session.userId
    );

    // If update_group is set, apply autopay to all bills in the group (pay_on stays per-row)
    if (req.body.update_group && existing.group_id && is_autopay != null) {
      db.prepare('UPDATE bills SET is_autopay = ? WHERE group_id = ? AND user_id = ?')
        .run(newIsAutopay, existing.group_id, req.session.userId);
    }

    // If update_group is set, apply the budget category to all bills in the group
    if (req.body.update_group && existing.group_id && budget_category_id !== undefined) {
      db.prepare('UPDATE bills SET budget_category_id = ? WHERE group_id = ? AND user_id = ?')
        .run(newBudgetCategoryId, existing.group_id, req.session.userId);
    }

    if (balanceDelta !== 0) {
      db.prepare(
        'UPDATE account SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?'
      ).run(balanceDelta, req.session.userId);
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'Database error' });
  }

  const updated = db
    .prepare(`
      SELECT b.*, p.name AS paycheck_name, bc.name AS budget_category_name
      FROM bills b
      LEFT JOIN paychecks p ON b.paycheck_id = p.id
      LEFT JOIN budget_categories bc ON b.budget_category_id = bc.id
      WHERE b.id = ?
    `)
    .get(id);

  const account = db
    .prepare('SELECT balance FROM account WHERE user_id = ?')
    .get(req.session.userId);

  res.json({ bill: updated, balance: account ? account.balance : 0 });
});

router.delete('/group/:groupId', (req, res) => {
  const { groupId } = req.params;
  db.prepare('DELETE FROM bills WHERE group_id = ? AND user_id = ?')
    .run(groupId, req.session.userId);
  res.json({ message: 'Deleted' });
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;

  const existing = db
    .prepare('SELECT * FROM bills WHERE id = ? AND user_id = ?')
    .get(id, req.session.userId);
  if (!existing) {
    return res.status(404).json({ error: 'Bill not found' });
  }

  db.prepare('DELETE FROM bills WHERE id = ? AND user_id = ?').run(id, req.session.userId);
  res.json({ message: 'Deleted' });
});

module.exports = router;
