-- ══════════════════════════════════════════════════════
-- ⚔️ Migration: مواجهة النهار الوجاهيّة — أثرها في دفتر المباراة
--   confrontation_initiated: هل نفّذ اللاعب مواجهةً (كطالب) في هذه المباراة
--   confrontation_outcome:   MAFIA_EXPOSED | CITIZEN_HIT | MAFIA_BETRAYAL | NONE (أو NULL بلا مواجهة)
-- ══════════════════════════════════════════════════════
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS confrontation_initiated BOOLEAN DEFAULT false;
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS confrontation_outcome VARCHAR(20);

-- 🗳️ نبض الإقناع (2026-09-12)
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS pulse_wins INTEGER DEFAULT 0;
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS pulse_vindicated BOOLEAN DEFAULT false;
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS pulse_correct_votes INTEGER DEFAULT 0;
