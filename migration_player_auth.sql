-- ══════════════════════════════════════════════════════
-- 🔐 هجرة نظام حسابات اللاعبين — Player Auth Migration
-- تاريخ: 2026-04-24
-- ══════════════════════════════════════════════════════

-- 1. إضافة حقل كلمة السر لجدول players
ALTER TABLE players ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- 2. إضافة علامة "يجب تغيير كلمة السر" (للاعبين المهاجرين)
ALTER TABLE players ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;

-- 3. إضافة playerId لجدول session_players
ALTER TABLE session_players ADD COLUMN IF NOT EXISTS player_id INTEGER;

-- 4. إضافة playerId لجدول match_players
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS player_id INTEGER;

-- 5. تحديث اللاعبين الحاليين بدون كلمة سر:
--    كلمة سر افتراضية "1234" (bcrypt hash)
--    يجب تغييرها عند أول تسجيل دخول
-- ملاحظة: الهاش التالي هو bcrypt لـ "1234" مع 10 rounds
-- يجب توليده عبر الباك إند عند التشغيل الأول بدلاً من SQL مباشرة
-- UPDATE players SET password_hash = '$GENERATED_HASH', must_change_password = true WHERE password_hash IS NULL;

-- ══════════════════════════════════════════════════════
-- ✅ لا يتم حذف أي بيانات — إضافات فقط
-- ══════════════════════════════════════════════════════
