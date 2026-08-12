const db = require('./database');

// Every user belongs to exactly one household. First touch of any budget
// feature creates their own single-member household.
function getHouseholdId(userId) {
  const membership = db
    .prepare('SELECT household_id FROM household_members WHERE user_id = ?')
    .get(userId);
  if (membership) return membership.household_id;

  const owned = db.prepare('SELECT id FROM households WHERE owner_id = ?').get(userId);
  const householdId = owned
    ? owned.id
    : Number(
        db.prepare("INSERT INTO households (name, owner_id) VALUES ('My Household', ?)")
          .run(userId).lastInsertRowid
      );
  db.prepare('INSERT INTO household_members (user_id, household_id) VALUES (?, ?)')
    .run(userId, householdId);
  return householdId;
}

function moveToOwnHousehold(userId) {
  const owned = db.prepare('SELECT id FROM households WHERE owner_id = ?').get(userId);
  const householdId = owned
    ? owned.id
    : Number(
        db.prepare("INSERT INTO households (name, owner_id) VALUES ('My Household', ?)")
          .run(userId).lastInsertRowid
      );
  db.prepare('UPDATE household_members SET household_id = ? WHERE user_id = ?')
    .run(householdId, userId);
}

module.exports = { getHouseholdId, moveToOwnHousehold };
