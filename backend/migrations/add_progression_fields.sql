-- ══════════════════════════════════════════════════════
-- 🎮 Migration: Add Progression System Fields
-- Run this BEFORE deploying the new code
-- ══════════════════════════════════════════════════════

-- ── Players table: Add progression fields ──
ALTER TABLE players ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;
ALTER TABLE players ADD COLUMN IF NOT EXISTS rank_tier VARCHAR(20) DEFAULT 'INFORMANT';
ALTER TABLE players ADD COLUMN IF NOT EXISTS rank_rr INTEGER DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS total_deals INTEGER DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS successful_deals INTEGER DEFAULT 0;

-- ── Match Players table: Add performance tracking fields ──
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS rounds_survived INTEGER DEFAULT 0;
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS deal_initiated BOOLEAN DEFAULT false;
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS deal_success BOOLEAN;
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS ability_used BOOLEAN DEFAULT false;
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS ability_correct BOOLEAN;
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS xp_earned INTEGER DEFAULT 0;
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS rr_change INTEGER DEFAULT 0;

-- ══════════════════════════════════════════════════════
-- ✅ Done! All existing data starts at Level 1, INFORMANT, 0 XP/RR
-- ══════════════════════════════════════════════════════
