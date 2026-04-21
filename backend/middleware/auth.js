const crypto = require('crypto');
const db = require('../database');

const AUTH_MODE = (process.env.AUTH_MODE || 'local').toLowerCase() === 'sso' ? 'sso' : 'local';
const SSO_HEADER_USERNAME = (process.env.SSO_HEADER_USERNAME || 'X-authentik-username').toLowerCase();
const SSO_HEADER_EMAIL    = (process.env.SSO_HEADER_EMAIL    || 'X-authentik-email').toLowerCase();

const ssoEnabled = () => AUTH_MODE === 'sso';

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function upsertSsoUser(username, email) {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return existing.id;
  const hash = 'sso:' + crypto.randomBytes(24).toString('hex');
  const info = db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)')
    .run(username, email || null, hash);
  const userId = Number(info.lastInsertRowid);
  db.prepare('INSERT INTO account (user_id, balance) VALUES (?, 0)').run(userId);
  return userId;
}

// Auto-establish a session for the forward-auth user if one isn't set yet.
// Only runs in SSO mode; safe to mount globally.
function ssoAutoLogin(req, res, next) {
  if (!ssoEnabled()) return next();
  if (req.session && req.session.userId) return next();
  const raw = req.headers[SSO_HEADER_USERNAME];
  const username = typeof raw === 'string' ? raw.trim() : '';
  if (!username) return next();
  const emailRaw = req.headers[SSO_HEADER_EMAIL];
  const email = typeof emailRaw === 'string' ? emailRaw.trim() || null : null;
  try {
    const userId = upsertSsoUser(username, email);
    req.session.userId = userId;
    req.session.username = username;
  } catch (e) {
    console.error('sso auto-login failed:', e.message);
  }
  next();
}

function blockIfSso(req, res, next) {
  if (ssoEnabled()) return res.status(403).json({ error: 'Disabled in SSO mode.' });
  next();
}

module.exports = { requireAuth, ssoAutoLogin, blockIfSso, ssoEnabled };
