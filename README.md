# Bills Tracker

A self-hosted bill tracking app that helps you manage bills, paychecks, and debts. Built with React and Node.js, runs in Docker.

## Features

- **Paycheck-based budgeting** -- assign bills to specific paychecks to see what's left after each pay period
- **Multiple pay schedules** -- supports semi-monthly (1st/15th), biweekly, weekly, and monthly
- **Biweekly auto-grouping** -- bills automatically sort into the correct pay window based on due date
- **Recurring bills** -- monthly, weekly, biweekly, yearly, or one-time with auto-extension
- **Debt tracking** -- track balances, interest rates, and see principal vs interest breakdown when payments are made
- **Drag-and-drop reordering** -- organize bills within each paycheck group
- **Account balance** -- running balance that updates as bills are marked paid
- **Multi-user** -- each user has their own bills, paychecks, and debts
- **Dark mode UI**

## Quick Start (Docker)

```bash
# Clone the repo
git clone https://github.com/burghr/bills-tracker.git
cd bills-tracker

# Create your .env file
echo "SESSION_SECRET=$(openssl rand -hex 32)" > .env

# Start it up
docker compose up -d
```

Open `http://localhost:3001` and create an account.

## Development Setup

**Backend:**
```bash
cd backend
cp .env.example .env    # Edit with your own session secret
npm install
node server.js
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

The frontend dev server proxies API requests to `http://localhost:3001`.

## Configuration

| Variable | Description | Default |
|---|---|---|
| `SESSION_SECRET` | Secret for session encryption (required) | -- |
| `PORT` | Server port | `3001` |
| `DB_PATH` | SQLite database file path | `./bills.db` |
| `SESSION_PATH` | Session file storage path | `./sessions` |

## Tech Stack

- **Frontend:** React, Vite
- **Backend:** Node.js, Express, SQLite
- **Auth:** Session-based with bcrypt
- **Deployment:** Docker (multi-stage build)

## How Pay Schedules Work

**Semi-monthly / Monthly / Weekly:** Bills are manually assigned to a paycheck. You decide which check pays which bill.

**Biweekly:** Set an anchor date (any upcoming pay date) and the app calculates all future pay dates every 14 days. Bills are automatically grouped into the correct pay window based on their due date -- no manual assignment needed.
