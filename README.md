# Bills Tracker

A self-hosted bill tracking and budgeting app that helps you manage bills, paychecks, debts, and monthly spending. Built with React and Node.js, runs in Docker.

## Features

- **Paycheck-based budgeting** - assign bills to specific paychecks to see what's left after each pay period
- **Multiple pay schedules** - supports semi-monthly (1st/15th), biweekly, weekly, and monthly
- **Biweekly auto-grouping** - bills automatically sort into the correct pay window based on due date
- **Recurring bills** - monthly, weekly, biweekly, yearly, or one-time with auto-extension
- **Debt tracking** - track balances, interest rates, and see principal vs interest breakdown when payments are made
- **Monthly spending budgets** - set a monthly amount per category (Food, Gas, Fun money), log transactions against them, and see what's left in each
- **Pace tracking** - each category shows where you *should* be based on the day of the month (a $900 food budget shows a marker at ~$450 mid-month)
- **Budget reports** - budget vs actual per category and a category breakdown of where money went
- **Household sharing** - share one budget with another user; both can log transactions (tracked per user) and both incomes count in reports
- **Drag-and-drop reordering** - organize bills within each paycheck group
- **Account balance** - running balance that updates as bills are marked paid
- **Multi-user** - each user has their own bills, paychecks, and debts
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

The SQLite database lives on the `bills-data` Docker volume (mounted at `/data`), so your data survives container rebuilds and upgrades. To keep it in a directory on the host instead, change the volume line in `docker-compose.yml`:

```yaml
    volumes:
      - ./data:/data
```

## Upgrading

Schema changes are additive (new tables and columns only), so an upgrade never touches existing rows. Still, back up the database file first; it's one file:

```bash
docker compose cp bills-tracker:/data/bills.db ./bills.db.backup
docker compose up -d --build
```

## Authentication with Authentik (SSO)

The app supports Authentik's forward-auth / proxy provider. In this mode the login and registration pages are disabled and users are auto-created from the headers Authentik injects.

1. In Authentik, create a **Proxy Provider** (forward auth, single application) for the app's URL and bind it to an application.
2. Make sure your reverse proxy passes the Authentik headers to the app (`X-authentik-username`, `X-authentik-email`). The standard Authentik nginx/Traefik forward-auth snippets do this already.
3. Set the auth mode in `.env`:

```bash
AUTH_MODE=sso
```

4. `docker compose up -d` and put the app behind the Authentik outpost.

**Important:** in SSO mode the app trusts the username header completely. Never expose the app's port directly to your network while `AUTH_MODE=sso`; all traffic must come through the Authentik proxy, or anyone able to reach the port can impersonate any user by setting the header themselves. Bind the port to localhost or a Docker network only the reverse proxy can reach.

While testing without Authentik, leave `AUTH_MODE=local` (the default) and use the built-in username/password login. Switching a running instance from local to SSO keeps existing users: an SSO login with a matching username picks up that user's data.

Logout in SSO mode redirects through `/outpost.goauthentik.io/sign_out` to end the Authentik session.

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
| `SESSION_SECRET` | Secret for session encryption (required) | - |
| `PORT` | Server port | `3001` |
| `DB_PATH` | SQLite database file path | `./bills.db` |
| `SESSION_PATH` | Session file storage path | `./sessions` |
| `AUTH_MODE` | `local` (built-in login) or `sso` (Authentik forward auth) | `local` |
| `SSO_HEADER_USERNAME` | Header carrying the username in SSO mode | `X-authentik-username` |
| `SSO_HEADER_EMAIL` | Header carrying the email in SSO mode | `X-authentik-email` |

## Tech Stack

- **Frontend:** React, Vite
- **Backend:** Node.js, Express, SQLite
- **Auth:** Session-based with bcrypt, or Authentik forward auth (SSO)
- **Deployment:** Docker (multi-stage build)

## How Pay Schedules Work

**Semi-monthly / Monthly / Weekly:** Bills are manually assigned to a paycheck. You decide which check pays which bill.

**Biweekly:** Set an anchor date (any upcoming pay date) and the app calculates all future pay dates every 14 days. Bills are automatically grouped into the correct pay window based on their due date - no manual assignment needed.

## How Budgets Work

Budgets live on the **Budget** page and are separate from bills: bills are fixed obligations (rent, insurance), budget categories are variable spending envelopes (food, gas).

- Each category has one monthly amount that carries forward every month. Editing it applies from now on; past months keep their recorded transactions.
- Categories can have one level of subcategories (Food → Groceries, Takeout). The parent holds the shared budget; subcategory spending rolls up into it. Give a subcategory its own amount only if you want a sub-limit inside the parent's total. Transactions and bills can point at either the parent or a subcategory.
- Log a transaction (amount, category, date, note) and the category's remaining balance updates immediately.
- The bar on each category fills as you spend. The white tick mark is today's pace: where your spending "should" be if it were spread evenly across the month. Green means under pace, yellow means ahead of pace but under budget, red means over budget.
- Reports show budget vs actual for each category plus a breakdown of spending share.
- A bill can be linked to a budget category (in the bill's edit dialog). Marking the bill paid automatically logs a matching transaction in that category (tagged "bill" on the Budget page); marking it unpaid or resetting the period removes it again. Autopay bills do the same when they sweep.
- Deleting a category that has transactions archives it instead, so history and old reports stay intact.

**Household sharing** (Profile page): the household owner can add another user by username. Both users then share one set of categories and transactions, each transaction records who entered it, and both users' paychecks count toward household income on the Budget page. Removing a member (or leaving) returns that user to their own private budget.
