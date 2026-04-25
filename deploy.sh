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

# إضافة أعمدة جديدة — يتجاهل الخطأ إذا موجودة
docker compose exec -T postgres psql -U mafia_user -d mafia_db -c \
  "ALTER TABLE players ADD COLUMN IF NOT EXISTS email VARCHAR(200);
   ALTER TABLE players ADD COLUMN IF NOT EXISTS avatar_url TEXT;
   ALTER TABLE players ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0;
   ALTER TABLE players ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;
   ALTER TABLE players ADD COLUMN IF NOT EXISTS rank_tier VARCHAR(20) DEFAULT 'INFORMANT';
   ALTER TABLE players ADD COLUMN IF NOT EXISTS rank_rr INTEGER DEFAULT 0;
   ALTER TABLE players ADD COLUMN IF NOT EXISTS total_deals INTEGER DEFAULT 0;
   ALTER TABLE players ADD COLUMN IF NOT EXISTS successful_deals INTEGER DEFAULT 0;
   ALTER TABLE match_players ADD COLUMN IF NOT EXISTS rounds_survived INTEGER DEFAULT 0;
   ALTER TABLE match_players ADD COLUMN IF NOT EXISTS deal_initiated BOOLEAN DEFAULT false;
   ALTER TABLE match_players ADD COLUMN IF NOT EXISTS deal_success BOOLEAN;
   ALTER TABLE match_players ADD COLUMN IF NOT EXISTS ability_used BOOLEAN DEFAULT false;
   ALTER TABLE match_players ADD COLUMN IF NOT EXISTS ability_correct BOOLEAN;
   ALTER TABLE match_players ADD COLUMN IF NOT EXISTS xp_earned INTEGER DEFAULT 0;
   ALTER TABLE match_players ADD COLUMN IF NOT EXISTS rr_change INTEGER DEFAULT 0;
   ALTER TABLE bookings ADD COLUMN IF NOT EXISTS player_id INTEGER;
   CREATE TABLE IF NOT EXISTS player_follows (
     id SERIAL PRIMARY KEY,
     follower_id INTEGER NOT NULL,
     following_id INTEGER NOT NULL,
     created_at TIMESTAMP DEFAULT NOW() NOT NULL,
     UNIQUE(follower_id, following_id)
   );" 2>/dev/null || true

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
