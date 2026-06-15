-- ══════════════════════════════════════════════════════════════════
-- 🎴 هجرة قاعدة البيانات: إنشاء بطاقة لكل دور
-- يتبع نفس تصميم "master" (DynamicMafiaCard) بالضبط
-- ══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════
-- 🔴 فريق المافيا
-- ═══════════════════════════════════════

-- 🔪 شيخ المافيا — GODFATHER
INSERT INTO card_templates (
  id, gradient, border_color, text_color, glow_effect,
  team_badge, icon, secret_face, elements
) VALUES (
  'godfather_card',
  'linear-gradient(to bottom, #7f1d1d, #1a0000, #0a0000)',
  'rgba(239, 68, 68, 0.7)',
  '#fca5a5',
  '0 0 30px rgba(239, 68, 68, 0.5)',
  '{"text":"فريق المافيا 🔴","bgColor":"rgba(127,29,29,0.6)","textColor":"#fca5a5","borderColor":"rgba(239,68,68,0.3)","mafiaText":"فريق المافيا 🔴","citizenText":"فريق المدينة 🔵","neutralText":"محايد ⚪"}',
  '{"type":"lucide","value":"Crown","size":48}',
  '{"type":"GENERATED"}',
  '{"showPlayerNumber":true,"showClubBranding":true,"showDescription":true,"fontFamily":"Amiri, serif"}'
) ON CONFLICT (id) DO UPDATE SET
  gradient = EXCLUDED.gradient,
  border_color = EXCLUDED.border_color,
  text_color = EXCLUDED.text_color,
  glow_effect = EXCLUDED.glow_effect,
  team_badge = EXCLUDED.team_badge,
  icon = EXCLUDED.icon,
  secret_face = EXCLUDED.secret_face,
  elements = EXCLUDED.elements;

-- 🤐 قص المافيا — SILENCER
INSERT INTO card_templates (
  id, gradient, border_color, text_color, glow_effect,
  team_badge, icon, secret_face, elements
) VALUES (
  'silencer_card',
  'linear-gradient(to bottom, #6b2121, #1c0a0a, #0a0000)',
  'rgba(220, 38, 38, 0.6)',
  '#fca5a5',
  '0 0 25px rgba(220, 38, 38, 0.4)',
  '{"text":"فريق المافيا 🔴","bgColor":"rgba(127,29,29,0.6)","textColor":"#fca5a5","borderColor":"rgba(239,68,68,0.3)","mafiaText":"فريق المافيا 🔴","citizenText":"فريق المدينة 🔵","neutralText":"محايد ⚪"}',
  '{"type":"lucide","value":"Scissors","size":48}',
  '{"type":"GENERATED"}',
  '{"showPlayerNumber":true,"showClubBranding":true,"showDescription":true,"fontFamily":"Amiri, serif"}'
) ON CONFLICT (id) DO UPDATE SET
  gradient = EXCLUDED.gradient,
  border_color = EXCLUDED.border_color,
  text_color = EXCLUDED.text_color,
  glow_effect = EXCLUDED.glow_effect,
  team_badge = EXCLUDED.team_badge,
  icon = EXCLUDED.icon,
  secret_face = EXCLUDED.secret_face,
  elements = EXCLUDED.elements;

-- 🦎 حرباية المافيا — CHAMELEON
INSERT INTO card_templates (
  id, gradient, border_color, text_color, glow_effect,
  team_badge, icon, secret_face, elements
) VALUES (
  'chameleon_card',
  'linear-gradient(to bottom, #78350f, #451a03, #1a0000)',
  'rgba(234, 88, 12, 0.6)',
  '#fdba74',
  '0 0 25px rgba(234, 88, 12, 0.4)',
  '{"text":"فريق المافيا 🔴","bgColor":"rgba(127,29,29,0.6)","textColor":"#fca5a5","borderColor":"rgba(239,68,68,0.3)","mafiaText":"فريق المافيا 🔴","citizenText":"فريق المدينة 🔵","neutralText":"محايد ⚪"}',
  '{"type":"lucide","value":"Drama","size":48}',
  '{"type":"GENERATED"}',
  '{"showPlayerNumber":true,"showClubBranding":true,"showDescription":true,"fontFamily":"Amiri, serif"}'
) ON CONFLICT (id) DO UPDATE SET
  gradient = EXCLUDED.gradient,
  border_color = EXCLUDED.border_color,
  text_color = EXCLUDED.text_color,
  glow_effect = EXCLUDED.glow_effect,
  team_badge = EXCLUDED.team_badge,
  icon = EXCLUDED.icon,
  secret_face = EXCLUDED.secret_face,
  elements = EXCLUDED.elements;

-- 🧙‍♀️ الساحرة — WITCH
INSERT INTO card_templates (
  id, gradient, border_color, text_color, glow_effect,
  team_badge, icon, secret_face, elements
) VALUES (
  'witch_card',
  'linear-gradient(to bottom, #581c87, #3b0764, #1a0000)',
  'rgba(168, 85, 247, 0.6)',
  '#d8b4fe',
  '0 0 25px rgba(168, 85, 247, 0.5)',
  '{"text":"فريق المافيا 🔴","bgColor":"rgba(127,29,29,0.6)","textColor":"#fca5a5","borderColor":"rgba(239,68,68,0.3)","mafiaText":"فريق المافيا 🔴","citizenText":"فريق المدينة 🔵","neutralText":"محايد ⚪"}',
  '{"type":"emoji","value":"🧙‍♀️","size":48}',
  '{"type":"GENERATED"}',
  '{"showPlayerNumber":true,"showClubBranding":true,"showDescription":true,"fontFamily":"Amiri, serif"}'
) ON CONFLICT (id) DO UPDATE SET
  gradient = EXCLUDED.gradient,
  border_color = EXCLUDED.border_color,
  text_color = EXCLUDED.text_color,
  glow_effect = EXCLUDED.glow_effect,
  team_badge = EXCLUDED.team_badge,
  icon = EXCLUDED.icon,
  secret_face = EXCLUDED.secret_face,
  elements = EXCLUDED.elements;

-- 🎭 مافيا عادي — MAFIA_REGULAR
INSERT INTO card_templates (
  id, gradient, border_color, text_color, glow_effect,
  team_badge, icon, secret_face, elements
) VALUES (
  'mafia_regular_card',
  'linear-gradient(to bottom, #4c1d1d, #1a0505, #0a0000)',
  'rgba(185, 28, 28, 0.5)',
  '#fca5a5',
  '0 0 20px rgba(185, 28, 28, 0.3)',
  '{"text":"فريق المافيا 🔴","bgColor":"rgba(127,29,29,0.6)","textColor":"#fca5a5","borderColor":"rgba(239,68,68,0.3)","mafiaText":"فريق المافيا 🔴","citizenText":"فريق المدينة 🔵","neutralText":"محايد ⚪"}',
  '{"type":"lucide","value":"Skull","size":48}',
  '{"type":"GENERATED"}',
  '{"showPlayerNumber":true,"showClubBranding":true,"showDescription":true,"fontFamily":"Amiri, serif"}'
) ON CONFLICT (id) DO UPDATE SET
  gradient = EXCLUDED.gradient,
  border_color = EXCLUDED.border_color,
  text_color = EXCLUDED.text_color,
  glow_effect = EXCLUDED.glow_effect,
  team_badge = EXCLUDED.team_badge,
  icon = EXCLUDED.icon,
  secret_face = EXCLUDED.secret_face,
  elements = EXCLUDED.elements;


-- ═══════════════════════════════════════
-- 🔵 فريق المواطنين
-- ═══════════════════════════════════════

-- 🔍 الشريف — SHERIFF
INSERT INTO card_templates (
  id, gradient, border_color, text_color, glow_effect,
  team_badge, icon, secret_face, elements
) VALUES (
  'sheriff_card',
  'linear-gradient(to bottom, #1e3a5f, #0c1929, #050d17)',
  'rgba(59, 130, 246, 0.6)',
  '#93c5fd',
  '0 0 25px rgba(59, 130, 246, 0.4)',
  '{"text":"فريق المدينة 🔵","bgColor":"rgba(30,58,138,0.6)","textColor":"#93c5fd","borderColor":"rgba(59,130,246,0.3)","mafiaText":"فريق المافيا 🔴","citizenText":"فريق المدينة 🔵","neutralText":"محايد ⚪"}',
  '{"type":"lucide","value":"Shield","size":48}',
  '{"type":"GENERATED"}',
  '{"showPlayerNumber":true,"showClubBranding":true,"showDescription":true,"fontFamily":"Amiri, serif"}'
) ON CONFLICT (id) DO UPDATE SET
  gradient = EXCLUDED.gradient,
  border_color = EXCLUDED.border_color,
  text_color = EXCLUDED.text_color,
  glow_effect = EXCLUDED.glow_effect,
  team_badge = EXCLUDED.team_badge,
  icon = EXCLUDED.icon,
  secret_face = EXCLUDED.secret_face,
  elements = EXCLUDED.elements;

-- 💉 الطبيب — DOCTOR
INSERT INTO card_templates (
  id, gradient, border_color, text_color, glow_effect,
  team_badge, icon, secret_face, elements
) VALUES (
  'doctor_card',
  'linear-gradient(to bottom, #14532d, #052e16, #021a0b)',
  'rgba(34, 197, 94, 0.6)',
  '#86efac',
  '0 0 25px rgba(34, 197, 94, 0.4)',
  '{"text":"فريق المدينة 🔵","bgColor":"rgba(30,58,138,0.6)","textColor":"#93c5fd","borderColor":"rgba(59,130,246,0.3)","mafiaText":"فريق المافيا 🔴","citizenText":"فريق المدينة 🔵","neutralText":"محايد ⚪"}',
  '{"type":"lucide","value":"HeartPulse","size":48}',
  '{"type":"GENERATED"}',
  '{"showPlayerNumber":true,"showClubBranding":true,"showDescription":true,"fontFamily":"Amiri, serif"}'
) ON CONFLICT (id) DO UPDATE SET
  gradient = EXCLUDED.gradient,
  border_color = EXCLUDED.border_color,
  text_color = EXCLUDED.text_color,
  glow_effect = EXCLUDED.glow_effect,
  team_badge = EXCLUDED.team_badge,
  icon = EXCLUDED.icon,
  secret_face = EXCLUDED.secret_face,
  elements = EXCLUDED.elements;

-- 🎯 القناص — SNIPER
INSERT INTO card_templates (
  id, gradient, border_color, text_color, glow_effect,
  team_badge, icon, secret_face, elements
) VALUES (
  'sniper_card',
  'linear-gradient(to bottom, #1c1917, #292524, #0c0a09)',
  'rgba(161, 161, 170, 0.6)',
  '#d4d4d8',
  '0 0 20px rgba(161, 161, 170, 0.3)',
  '{"text":"فريق المدينة 🔵","bgColor":"rgba(30,58,138,0.6)","textColor":"#93c5fd","borderColor":"rgba(59,130,246,0.3)","mafiaText":"فريق المافيا 🔴","citizenText":"فريق المدينة 🔵","neutralText":"محايد ⚪"}',
  '{"type":"lucide","value":"Crosshair","size":48}',
  '{"type":"GENERATED"}',
  '{"showPlayerNumber":true,"showClubBranding":true,"showDescription":true,"fontFamily":"Amiri, serif"}'
) ON CONFLICT (id) DO UPDATE SET
  gradient = EXCLUDED.gradient,
  border_color = EXCLUDED.border_color,
  text_color = EXCLUDED.text_color,
  glow_effect = EXCLUDED.glow_effect,
  team_badge = EXCLUDED.team_badge,
  icon = EXCLUDED.icon,
  secret_face = EXCLUDED.secret_face,
  elements = EXCLUDED.elements;

-- 👮‍♀️ الشرطية — POLICEWOMAN
INSERT INTO card_templates (
  id, gradient, border_color, text_color, glow_effect,
  team_badge, icon, secret_face, elements
) VALUES (
  'policewoman_card',
  'linear-gradient(to bottom, #172554, #1e1b4b, #0c0a1f)',
  'rgba(99, 102, 241, 0.6)',
  '#a5b4fc',
  '0 0 25px rgba(99, 102, 241, 0.4)',
  '{"text":"فريق المدينة 🔵","bgColor":"rgba(30,58,138,0.6)","textColor":"#93c5fd","borderColor":"rgba(59,130,246,0.3)","mafiaText":"فريق المافيا 🔴","citizenText":"فريق المدينة 🔵","neutralText":"محايد ⚪"}',
  '{"type":"lucide","value":"BadgeAlert","size":48}',
  '{"type":"GENERATED"}',
  '{"showPlayerNumber":true,"showClubBranding":true,"showDescription":true,"fontFamily":"Amiri, serif"}'
) ON CONFLICT (id) DO UPDATE SET
  gradient = EXCLUDED.gradient,
  border_color = EXCLUDED.border_color,
  text_color = EXCLUDED.text_color,
  glow_effect = EXCLUDED.glow_effect,
  team_badge = EXCLUDED.team_badge,
  icon = EXCLUDED.icon,
  secret_face = EXCLUDED.secret_face,
  elements = EXCLUDED.elements;

-- 🏥 الممرضة — NURSE
INSERT INTO card_templates (
  id, gradient, border_color, text_color, glow_effect,
  team_badge, icon, secret_face, elements
) VALUES (
  'nurse_card',
  'linear-gradient(to bottom, #134e4a, #042f2e, #021a19)',
  'rgba(20, 184, 166, 0.6)',
  '#5eead4',
  '0 0 25px rgba(20, 184, 166, 0.4)',
  '{"text":"فريق المدينة 🔵","bgColor":"rgba(30,58,138,0.6)","textColor":"#93c5fd","borderColor":"rgba(59,130,246,0.3)","mafiaText":"فريق المافيا 🔴","citizenText":"فريق المدينة 🔵","neutralText":"محايد ⚪"}',
  '{"type":"lucide","value":"Syringe","size":48}',
  '{"type":"GENERATED"}',
  '{"showPlayerNumber":true,"showClubBranding":true,"showDescription":true,"fontFamily":"Amiri, serif"}'
) ON CONFLICT (id) DO UPDATE SET
  gradient = EXCLUDED.gradient,
  border_color = EXCLUDED.border_color,
  text_color = EXCLUDED.text_color,
  glow_effect = EXCLUDED.glow_effect,
  team_badge = EXCLUDED.team_badge,
  icon = EXCLUDED.icon,
  secret_face = EXCLUDED.secret_face,
  elements = EXCLUDED.elements;

-- 👤 مواطن صالح — CITIZEN
INSERT INTO card_templates (
  id, gradient, border_color, text_color, glow_effect,
  team_badge, icon, secret_face, elements
) VALUES (
  'citizen_card',
  'linear-gradient(to bottom, #27272a, #18181b, #09090b)',
  'rgba(161, 161, 170, 0.4)',
  '#d4d4d8',
  '0 0 15px rgba(161, 161, 170, 0.2)',
  '{"text":"فريق المدينة 🔵","bgColor":"rgba(30,58,138,0.6)","textColor":"#93c5fd","borderColor":"rgba(59,130,246,0.3)","mafiaText":"فريق المافيا 🔴","citizenText":"فريق المدينة 🔵","neutralText":"محايد ⚪"}',
  '{"type":"lucide","value":"User","size":48}',
  '{"type":"GENERATED"}',
  '{"showPlayerNumber":true,"showClubBranding":true,"showDescription":true,"fontFamily":"Amiri, serif"}'
) ON CONFLICT (id) DO UPDATE SET
  gradient = EXCLUDED.gradient,
  border_color = EXCLUDED.border_color,
  text_color = EXCLUDED.text_color,
  glow_effect = EXCLUDED.glow_effect,
  team_badge = EXCLUDED.team_badge,
  icon = EXCLUDED.icon,
  secret_face = EXCLUDED.secret_face,
  elements = EXCLUDED.elements;


-- ═══════════════════════════════════════
-- 🟡 فريق محايد
-- ═══════════════════════════════════════

-- 🤡 المهرج — JESTER
INSERT INTO card_templates (
  id, gradient, border_color, text_color, glow_effect,
  team_badge, icon, secret_face, elements
) VALUES (
  'jester_card',
  'linear-gradient(to bottom, #713f12, #422006, #1a0e00)',
  'rgba(245, 158, 11, 0.6)',
  '#fcd34d',
  '0 0 25px rgba(245, 158, 11, 0.4)',
  '{"text":"محايد ⚪","bgColor":"rgba(120,53,15,0.6)","textColor":"#fcd34d","borderColor":"rgba(245,158,11,0.3)","mafiaText":"فريق المافيا 🔴","citizenText":"فريق المدينة 🔵","neutralText":"محايد ⚪"}',
  '{"type":"emoji","value":"🤡","size":48}',
  '{"type":"GENERATED"}',
  '{"showPlayerNumber":true,"showClubBranding":true,"showDescription":true,"fontFamily":"Amiri, serif"}'
) ON CONFLICT (id) DO UPDATE SET
  gradient = EXCLUDED.gradient,
  border_color = EXCLUDED.border_color,
  text_color = EXCLUDED.text_color,
  glow_effect = EXCLUDED.glow_effect,
  team_badge = EXCLUDED.team_badge,
  icon = EXCLUDED.icon,
  secret_face = EXCLUDED.secret_face,
  elements = EXCLUDED.elements;

-- 🔪 السفّاح — ASSASSIN
INSERT INTO card_templates (
  id, gradient, border_color, text_color, glow_effect,
  team_badge, icon, secret_face, elements
) VALUES (
  'assassin_card',
  'linear-gradient(to bottom, #1c1917, #0f0e0d, #000000)',
  'rgba(245, 158, 11, 0.5)',
  '#fbbf24',
  '0 0 20px rgba(245, 158, 11, 0.3)',
  '{"text":"محايد ⚪","bgColor":"rgba(120,53,15,0.6)","textColor":"#fcd34d","borderColor":"rgba(245,158,11,0.3)","mafiaText":"فريق المافيا 🔴","citizenText":"فريق المدينة 🔵","neutralText":"محايد ⚪"}',
  '{"type":"lucide","value":"Sword","size":48}',
  '{"type":"GENERATED"}',
  '{"showPlayerNumber":true,"showClubBranding":true,"showDescription":true,"fontFamily":"Amiri, serif"}'
) ON CONFLICT (id) DO UPDATE SET
  gradient = EXCLUDED.gradient,
  border_color = EXCLUDED.border_color,
  text_color = EXCLUDED.text_color,
  glow_effect = EXCLUDED.glow_effect,
  team_badge = EXCLUDED.team_badge,
  icon = EXCLUDED.icon,
  secret_face = EXCLUDED.secret_face,
  elements = EXCLUDED.elements;


-- ═══════════════════════════════════════
-- 👥 التوأمين (تحديث — إصلاح gradient من Tailwind إلى CSS)
-- ═══════════════════════════════════════

-- الأخ الأكبر
UPDATE card_templates SET
  gradient = 'linear-gradient(to bottom, #7f1d1d, #1e293b, #450a0a)',
  secret_face = '{"type":"GENERATED"}',
  elements = '{"showPlayerNumber":true,"showClubBranding":true,"showDescription":true,"fontFamily":"Amiri, serif"}',
  team_badge = '{"text":"فريق المافيا 🔴","bgColor":"rgba(127,29,29,0.6)","textColor":"#fca5a5","borderColor":"rgba(239,68,68,0.3)","mafiaText":"فريق المافيا 🔴","citizenText":"فريق المدينة 🔵","neutralText":"محايد ⚪"}'
WHERE id = 'twin_older_card';

-- الأخ الأصغر
UPDATE card_templates SET
  gradient = 'linear-gradient(to bottom, #1e3a8a, #1e293b, #581c87)',
  secret_face = '{"type":"GENERATED"}',
  elements = '{"showPlayerNumber":true,"showClubBranding":true,"showDescription":true,"fontFamily":"Amiri, serif"}',
  team_badge = '{"text":"فريق المدينة 🔵","bgColor":"rgba(30,58,138,0.6)","textColor":"#93c5fd","borderColor":"rgba(59,130,246,0.3)","mafiaText":"فريق المافيا 🔴","citizenText":"فريق المدينة 🔵","neutralText":"محايد ⚪"}'
WHERE id = 'twin_younger_card';


-- ═══════════════════════════════════════
-- 🔗 ربط كل دور ببطاقته
-- ═══════════════════════════════════════

UPDATE role_definitions SET card_template_id = 'godfather_card'      WHERE id = 'GODFATHER';
UPDATE role_definitions SET card_template_id = 'silencer_card'       WHERE id = 'SILENCER';
UPDATE role_definitions SET card_template_id = 'chameleon_card'      WHERE id = 'CHAMELEON';
UPDATE role_definitions SET card_template_id = 'witch_card'          WHERE id = 'WITCH';
UPDATE role_definitions SET card_template_id = 'mafia_regular_card'  WHERE id = 'MAFIA_REGULAR';
UPDATE role_definitions SET card_template_id = 'sheriff_card'        WHERE id = 'SHERIFF';
UPDATE role_definitions SET card_template_id = 'doctor_card'         WHERE id = 'DOCTOR';
UPDATE role_definitions SET card_template_id = 'sniper_card'         WHERE id = 'SNIPER';
UPDATE role_definitions SET card_template_id = 'policewoman_card'    WHERE id = 'POLICEWOMAN';
UPDATE role_definitions SET card_template_id = 'nurse_card'          WHERE id = 'NURSE';
UPDATE role_definitions SET card_template_id = 'citizen_card'        WHERE id = 'CITIZEN';
UPDATE role_definitions SET card_template_id = 'jester_card'         WHERE id = 'JESTER';
UPDATE role_definitions SET card_template_id = 'assassin_card'       WHERE id = 'ASSASSIN';
-- التوأمين (مربوطين سابقاً — تأكيد)
UPDATE role_definitions SET card_template_id = 'twin_older_card'     WHERE id = 'OLDER_BROTHER';
UPDATE role_definitions SET card_template_id = 'twin_younger_card'   WHERE id = 'YOUNGER_BROTHER';
