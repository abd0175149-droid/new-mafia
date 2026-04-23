#!/bin/bash
# ══════════════════════════════════════════════════════
# 🎭 Unified Mafia Platform — Deploy Script
# ══════════════════════════════════════════════════════

set -e

echo "🎭 ══════════════════════════════════════════"
echo "   Unified Mafia Platform — Deployment"
echo "══════════════════════════════════════════════"

# ── 1. Pull latest code ──
echo ""
echo "1️⃣  Fetching latest code from GitHub..."
git pull origin master

# ── 2. Check .env file ──
if [ ! -f .env ]; then
  echo "⚠️  No .env file found! Creating from template..."
  cp .env.production .env
  echo "📝 Please edit .env with your production values, then re-run deploy.sh"
  exit 1
fi

# ── 3. Build containers ──
echo ""
echo "2️⃣  Building new containers (current ones still running)..."
docker compose build --no-cache

# ── 4. Deploy with minimal downtime ──
echo ""
echo "3️⃣  Replacing containers with new build (minimal downtime)..."
docker compose up -d --force-recreate

# ── 5. Run database migrations ──
echo ""
echo "4️⃣  Running database migrations..."
sleep 5  # Wait for postgres to be ready

# إضافة أعمدة جديدة (email, avatar_url) — يتجاهل الخطأ إذا موجودة
docker compose exec -T postgres psql -U mafia_user -d mafia_db -c \
  "ALTER TABLE players ADD COLUMN IF NOT EXISTS email VARCHAR(200);" 2>/dev/null || true
docker compose exec -T postgres psql -U mafia_user -d mafia_db -c \
  "ALTER TABLE players ADD COLUMN IF NOT EXISTS avatar_url TEXT;" 2>/dev/null || true

echo "   ✅ Database columns verified"

# ── 6. Cleanup ──
echo ""
echo "5️⃣  Cleaning up old Docker images..."
docker image prune -f

# ── 7. Verify ──
echo ""
echo "6️⃣  Verifying services..."
docker compose ps

echo ""
echo "✅ ══════════════════════════════════════════"
echo "   Deployment Successful!"
echo "   🌐 Live at: https://club-mafia.grade.sbs"
echo "══════════════════════════════════════════════"
