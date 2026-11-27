// ══════════════════════════════════════════════════════
// 🔮 الموسم القادم في «إدارة المواسم» — كلّ ما يخصّ المسودّة في ردٍّ واحد
//
// المسودّة في جدولٍ مستقلّ (season_drafts) عمداً: لا رقم موسم ولا مباريات قبل التفعيل.
// هذه الخدمة تجمع لها ما تحتاجه الإدارة: الحالة، والكروت الخمسة بوجوهها ومفاتيحها،
// والقصّة، وفحوص الجاهزيّة، ومباريات التجربة. لا تكتب شيئاً إلّا مفتاح إطفاء كرت.
// القصّة في season_drafts.content لا في الكود: المستودع عامّ، وفيها سرّ الموسم ونهايتاه.
// ══════════════════════════════════════════════════════
import { sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { PROPHECY } from './feature-flags.js';
import { PROPHECY_CARD_INFO } from '../game/prophecy-cards.js';
import { FLIP_LINES, WEEK_LINES, seasonWeek } from '../game/prophecy-content.js';
import { thumbUrls } from './card-face-thumbs.service.js';

const rowsOf = (r: any): any[] => (Array.isArray(r) ? r : r?.rows || []);
const ar = (n: number) => n.toLocaleString('ar-EG');
/** طوابع القاعدة بلا منطقة زمنيّة هي UTC — تُرسل ISO كي لا يقرأها المتصفّح محلّيّة (أو يرفضها سفاري) */
const isoUtc = (v: any): string | null => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  const t = String(v);
  return /[zZ]|[+-]\d\d:?\d\d$/.test(t) ? new Date(t).toISOString() : new Date(t.replace(' ', 'T') + 'Z').toISOString();
};
export const PROPHECY_ROLES = PROPHECY_CARD_INFO.map(c => c.role);

export type DraftStatus = 'DRAFT' | 'ACTIVE' | 'ENDED';

export async function getSeasonDraftOverview() {
  const db = getDB();
  if (!db) throw new Error('قاعدة البيانات غير متوفرة');

  // المسودّة المعلّقة أوّلاً، وإلّا أحدث مسودّةٍ فُعّلت (فيبقى القسم بعد التفعيل)
  const [d] = rowsOf(await db.execute(sql`
    SELECT id, name, content_pack, content, created_at, activated_season_id, activated_at
    FROM season_drafts ORDER BY (activated_season_id IS NULL) DESC, id DESC LIMIT 1`));
  if (!d) return { draft: null };

  let season: any = null;
  if (d.activated_season_id) {
    [season] = rowsOf(await db.execute(sql`
      SELECT s.id, s.name, s.season_number, s.status, s.started_at, s.ended_at,
             (SELECT count(*)::int FROM matches m WHERE m.season_id = s.id) AS matches
      FROM seasons s WHERE s.id = ${d.activated_season_id}`));
  }
  const status: DraftStatus = !d.activated_season_id ? 'DRAFT' : season?.status === 'ACTIVE' ? 'ACTIVE' : 'ENDED';

  // الموسم العاديّ النشط الآن (ما سيُنهيه التفعيل)
  const [current] = rowsOf(await db.execute(sql`
    SELECT s.id, s.name, s.season_number, s.started_at, s.content_pack,
           (SELECT count(*)::int FROM matches m WHERE m.season_id = s.id) AS matches
    FROM seasons s WHERE s.status = 'ACTIVE' AND s.type = 'REGULAR' LIMIT 1`));

  // الكروت: تعريفاتها، ووجوهها من قوالبها، ومفاتيح إطفائها
  const defs = rowsOf(await db.execute(sql`
    SELECT rd.id, rd.name_ar, rd.team, rd.card_template_id, ct.secret_face->>'customImageUrl' AS face
    FROM role_definitions rd LEFT JOIN card_templates ct ON ct.id = rd.card_template_id
    WHERE rd.id IN (${sql.join(PROPHECY_ROLES.map(r => sql`${r}`), sql`, `)})`));
  const flagKeys = [PROPHECY, ...PROPHECY_ROLES.map(r => `card_off_${r}`)];
  const flags = rowsOf(await db.execute(sql`
    SELECT key, value, updated_at FROM wa_runtime_flags
    WHERE key IN (${sql.join(flagKeys.map(k => sql`${k}`), sql`, `)})`));
  const flagOf = (k: string) => flags.find(f => f.key === k);
  const isOn = (k: string) => flagOf(k)?.value?.enabled === true;

  const cards = PROPHECY_CARD_INFO.map(info => {
    const def = defs.find(x => x.id === info.role);
    const off = flagOf(`card_off_${info.role}`);
    return {
      ...info,
      nameAr: def?.name_ar ?? info.role,
      registered: !!def,
      face: def?.face || null,
      // مصغّر ٧٢٠ للشبكة (الأصل حتّى ٣ ميغابايت)، والأصل لنافذة العرض الكاملة
      faceThumb: def?.face ? (thumbUrls(def.face).thumbUrl || def.face) : null,
      flipLine: FLIP_LINES[info.role] || null,
      off: off?.value?.enabled === true,
      offBy: off?.value?.by || null,
      offAt: off?.value?.at || null,
    };
  });

  // مباريات النبوءة: التجربة (موقع الاختبار) والحقيقيّة
  const [ledger] = rowsOf(await db.execute(sql`
    SELECT count(*)::int AS total,
           COALESCE(SUM(CASE WHEN is_test THEN 1 ELSE 0 END), 0)::int AS test,
           COALESCE(SUM(CASE WHEN line = 'TRUTH' THEN 1 ELSE 0 END), 0)::int AS truth,
           COALESCE(SUM(CASE WHEN line = 'MASK' THEN 1 ELSE 0 END), 0)::int AS mask,
           max(created_at) AS last_at
    FROM prophecy_ledger`));
  const testLocations = rowsOf(await db.execute(sql`SELECT id, name FROM locations WHERE is_test_location ORDER BY id`));

  const week = status === 'ACTIVE' ? seasonWeek(isoUtc(season?.started_at)) : null;
  const faces = cards.filter(c => c.face).length;
  const offCards = cards.filter(c => c.off);
  const emergency = isOn(PROPHECY);

  // فحوص الجاهزيّة — كلّها محسوبة من القاعدة لحظة الطلب
  const checks = [
    { key: 'cards', label: 'الكروت الخمسة مسجّلة في تعريفات الأدوار', ok: cards.every(c => c.registered), note: `${ar(cards.filter(c => c.registered).length)} من ${ar(cards.length)}` },
    { key: 'faces', label: 'وجوه الكروت مرفوعة ومربوطة', ok: faces === cards.length, note: faces ? `${ar(faces)} من ${ar(cards.length)}` : 'بانتظار رسوم الكروت' },
    { key: 'trial', label: 'مباريات تجربة في موقع الاختبار', ok: (ledger?.test ?? 0) > 0, note: ledger?.test ? `${ar(ledger.test)} مباراة` : 'لم تُلعب مباراة تجربة بعد' },
    { key: 'switches', label: 'كلّ الكروت مفتوحة (لا مفتاح إطفاء)', ok: offCards.length === 0, note: offCards.length ? `مطفأ: ${offCards.map(c => c.nameAr).join('، ')}` : 'لا كرت مطفأ' },
    { key: 'emergency', label: 'مفتاح الطوارئ مطفأ (الكروت لا تعمل خارج موقع الاختبار)', ok: !emergency, note: emergency ? 'مفتوح: الكروت تعمل في كلّ الغرف الآن' : 'مطفأ' },
  ];

  return {
    draft: {
      id: Number(d.id), name: d.name, contentPack: d.content_pack, createdAt: isoUtc(d.created_at),
      activatedSeasonId: d.activated_season_id ? Number(d.activated_season_id) : null, activatedAt: isoUtc(d.activated_at),
    },
    status,
    season: season ? { id: Number(season.id), name: season.name, seasonNumber: season.season_number, status: season.status, startedAt: isoUtc(season.started_at), endedAt: isoUtc(season.ended_at), matches: season.matches } : null,
    current: current ? { id: Number(current.id), name: current.name, seasonNumber: current.season_number, startedAt: isoUtc(current.started_at), matches: current.matches, contentPack: current.content_pack } : null,
    runsIn: status === 'ACTIVE' ? 'ALL' : emergency ? 'EMERGENCY' : 'TEST',
    testLocations,
    emergency,
    week, weekLine: week ? WEEK_LINES[week - 1] : null,
    weekLines: WEEK_LINES,
    cards,
    ledger: { total: ledger?.total ?? 0, test: ledger?.test ?? 0, real: (ledger?.total ?? 0) - (ledger?.test ?? 0), truth: ledger?.truth ?? 0, mask: ledger?.mask ?? 0, lastAt: isoUtc(ledger?.last_at) },
    checks,
    story: d.content?.story ?? null,
    trackerUrl: d.content?.trackerUrl ?? null,
  };
}

/** مفتاح إطفاء كرتٍ واحد: off=true يمنعه من التوزيع في كلّ الغرف (يسري خلال ثوانٍ على التوزيع التالي) */
export async function setProphecyCardOff(role: string, off: boolean, by: string) {
  if (!PROPHECY_ROLES.includes(role)) throw Object.assign(new Error('كرتٌ غير معروف في هذا الموسم'), { status: 400 });
  const db = getDB();
  if (!db) throw new Error('قاعدة البيانات غير متوفرة');
  const key = `card_off_${role}`;
  await db.execute(sql`INSERT INTO wa_runtime_flags (key, value, updated_at)
    VALUES (${key}, ${JSON.stringify({ enabled: off, by, at: new Date().toISOString() })}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`);
}
