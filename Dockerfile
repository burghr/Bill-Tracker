# ── Stage 1: Build the React frontend ────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /build

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


# ── Stage 2: Production runtime ───────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

# Install backend dependencies (production only)
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Copy backend source
COPY backend/ ./backend/

# Copy built frontend from stage 1
COPY --from=builder /build/dist ./frontend/dist

EXPOSE 3001

CMD ["node", "backend/server.js"]
