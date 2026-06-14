-- ══════════════════════════════════════════════════════
-- 👥 هجرة قاعدة البيانات: شخصيتي التوأمين
-- الأخ الأكبر (OLDER_BROTHER) + الأخ الأصغر (YOUNGER_BROTHER)
-- ══════════════════════════════════════════════════════

-- 1. تعريف الدورين في role_definitions
INSERT INTO role_definitions (
  id, name_ar, name_en, team, abilities, gen_priority,
  gen_max_count, gen_min_players, gen_is_required,
  description
) VALUES
('OLDER_BROTHER', 'الأخ الأكبر', 'Older Brother', 'MAFIA',
 '["KILL"]', 15, 1, 10, false,
 'أخ المافيا — يرث الاغتيال في سلسلة الوراثة (قبل المافيا العادي). إذا مات أخوه الأصغر، ينتحر فوراً. قدرته السلبية مستثناة من تعطيل الساحرة.'),
('YOUNGER_BROTHER', 'الأخ الأصغر', 'Younger Brother', 'CITIZEN',
 '[]', 15, 1, 10, false,
 'مواطن مرتبط بأخيه الأكبر في المافيا. إذا مات أخوه الأكبر، يتحول فوراً إلى فريق المافيا ويرث أول دور مافياوي ميت (حسب الأولوية: شيخ → قص → حرباية → عادي). قدرته السلبية مستثناة من تعطيل الساحرة.')
ON CONFLICT (id) DO UPDATE SET
  name_ar = EXCLUDED.name_ar,
  name_en = EXCLUDED.name_en,
  description = EXCLUDED.description;

-- 2. بطاقة الأخ الأكبر (مافيا — أحمر داكن)
INSERT INTO card_templates (
  id, gradient, border_color, text_color, glow_effect,
  team_badge, icon, elements
) VALUES (
  'twin_older_card',
  'from-red-900 via-slate-800 to-red-950',
  'rgba(220, 38, 38, 0.6)',
  '#fca5a5',
  '0 0 25px rgba(168, 85, 247, 0.4)',
  '{"text":"مافيا","bgColor":"rgba(220,38,38,0.3)","textColor":"#fca5a5","borderColor":"rgba(220,38,38,0.5)"}',
  '{"type":"EMOJI","value":"👥"}',
  '{"showPlayerNumber":true,"showClubBranding":true,"showDescription":true}'
) ON CONFLICT (id) DO UPDATE SET
  gradient = EXCLUDED.gradient,
  border_color = EXCLUDED.border_color,
  glow_effect = EXCLUDED.glow_effect;

-- 3. بطاقة الأخ الأصغر (مواطن — أزرق مع لمسة بنفسجية)
INSERT INTO card_templates (
  id, gradient, border_color, text_color, glow_effect,
  team_badge, icon, elements
) VALUES (
  'twin_younger_card',
  'from-blue-900 via-slate-800 to-purple-950',
  'rgba(168, 85, 247, 0.6)',
  '#c4b5fd',
  '0 0 25px rgba(168, 85, 247, 0.4)',
  '{"text":"مواطن","bgColor":"rgba(59,130,246,0.3)","textColor":"#93c5fd","borderColor":"rgba(59,130,246,0.5)"}',
  '{"type":"EMOJI","value":"👥"}',
  '{"showPlayerNumber":true,"showClubBranding":true,"showDescription":true}'
) ON CONFLICT (id) DO UPDATE SET
  gradient = EXCLUDED.gradient,
  border_color = EXCLUDED.border_color,
  glow_effect = EXCLUDED.glow_effect;

-- 4. ربط البطاقات بالأدوار
UPDATE role_definitions SET card_template_id = 'twin_older_card' WHERE id = 'OLDER_BROTHER';
UPDATE role_definitions SET card_template_id = 'twin_younger_card' WHERE id = 'YOUNGER_BROTHER';
