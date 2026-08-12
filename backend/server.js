require('dotenv').config();
const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS only needed in local dev (Vite dev server on :5173).
// In Docker, Express serves the built frontend so everything is same-origin.
if (process.env.NODE_ENV !== 'production') {
  app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  }));
}

app.use(express.json());

const sessionPath = process.env.SESSION_PATH || path.join(__dirname, 'sessions');
app.use(session({
  store: new FileStore({ path: sessionPath, ttl: 365 * 24 * 3600, reapInterval: 24 * 3600 }),
  secret: process.env.SESSION_SECRET || 'fallback-dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,
    maxAge: 365 * 24 * 60 * 60 * 1000,
  },
}));

const { ssoAutoLogin } = require('./middleware/auth');
app.use(ssoAutoLogin);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/paychecks', require('./routes/paychecks'));
app.use('/api/bills', require('./routes/bills'));
app.use('/api/balance', require('./routes/balance'));
app.use('/api/debts', require('./routes/debts'));
app.use('/api/budget', require('./routes/budget'));

// Serve built frontend (production / Docker)
const distDir = path.join(__dirname, '../frontend/dist');
app.use(express.static(distDir));

// SPA fallback — let React Router handle all non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
