// ══════════════════════════════════════════════════════
// 🪪 بطاقةُ اللاعب للموظّف — منفذٌ واحدٌ للقراءة
//
// 🔴 لماذا منفذٌ جديد لا توسيعُ `/api/player/:id/profile`: ذاك يخدم اللاعبَ
//    عن نفسه وشكلُه عقدٌ مع ثلاث منصّات. وهذا يخدم شاشةَ قرارٍ في ليلةٍ
//    جارية، ويعيد **أقساماً حسب دور الطالب** — لا ملفّاً واحداً يُقصّ في
//    الواجهة. الإخفاءُ في الواجهة ليس حمايةً: ما لا يملكه الدورُ لا يُرسَل.
//
// 🔴 والحمولةُ مسقوفةٌ عمداً: المنفذُ القديم يعيد ٦٧٫٨ ك.ب في كلّ فتحة، منها
//    ٤٧ ك.ب تفصيلُ نقاطٍ يُبنى لخمسين مباراةً ثمّ يُرمى كلُّه — الصفحةُ ترسم
//    ثلاثةَ صفوف. ٩٣٪ ممّا يُنقل لا يُرى. هنا يُطلب ما يُرسَم فقط.
//
// 🔴 والقاعدةُ الحاكمة للتصميم المعتمَد («بابٌ بمفتاح»): لا يُعرض سببُ منعٍ
//    إلّا ومعه ما يُصلحه. فترتيبُ البوّابات ثابتٌ ومتنافٍ، ولكلِّ حالةٍ فعلٌ
//    واحدٌ مناسب — وحجبُ الاستبيان سقط من السلسلة بقرار المالك.
// ══════════════════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { teamOfRole } from '../game/roles.js';
import { mergeActivityPins, samePinPerson } from '../game/seat-merge.js';

const router = Router();

/** تاريخُ بدء احتساب الدَّين — قرارُ المالك: لا مطالبةَ بأثرٍ رجعيّ */
const DEBT_SINCE = '2026-09-01';

/** نتائجُ فحصِ الموقع التي لا تُعدّ فشلاً */
const GEO_OK = ['OK', 'OK_STORED', 'EXEMPT', 'EXEMPT_PLAYER'];

type Row = Record<string, any>;
const rows = (r: any): Row[] => (r?.rows ?? r ?? []) as Row[];
const one = (r: any): Row | null => rows(r)[0] ?? null;

router.get(
  '/player/:id/card',
  authenticate,
  // 🔴 لا leader ولا location_owner: قرارُ المالك أنّ شريكَ المكان لا يصل
  //    هذه الصفحة أصلاً، والليدرُ يعمل من لوحته لا من ملفّات اللاعبين.
  authorize('admin', 'manager', 'accountant'),
  async (req: Request, res: Response) => {
    const playerId = parseInt(req.params.id);
    if (!playerId || isNaN(playerId)) {
      return res.status(400).json({ success: false, error: 'معرّف اللاعب غير صالح' });
    }
    const db = getDB();
    if (!db) return res.status(503).json({ success: false, error: 'قاعدة البيانات غير متوفرة' });

    const role = req.user?.role ?? '';
    const isAdmin = role === 'admin';
    const activityId = Number(req.query.activityId) || null;

    try {
      // ── الهويّة ──
      const p = one(await db.execute(sql`
        SELECT id, name, phone, gender, dob, avatar_url, created_at,
               is_locked, locked_reason, locked_at, locked_by,
               is_test_account, is_free_account, must_change_password,
               linked_staff_id, geofence_exempt, geofence_exempt_reason,
               lifetime_matches, total_matches
        FROM players WHERE id = ${playerId} AND deleted_at IS NULL
      `));
      if (!p) return res.status(404).json({ success: false, error: 'اللاعب غير موجود' });

      // 🔴 العمرُ لا التاريخ لغير الأدمن (قرارُ المالك: الميلادُ للأدمن).
      //    والقرارُ يحتاج الخانةَ لا اليوم — «قاصر» أو «٢٠ سنة».
      const age = (() => {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(p.dob ?? '').trim());
        if (!m) return null;
        const now = new Date();
        let a = now.getFullYear() - +m[1];
        if (now.getMonth() + 1 < +m[2] || (now.getMonth() + 1 === +m[2] && now.getDate() < +m[3])) a--;
        return a >= 0 && a < 120 ? a : null;
      })();

      const identity: Row = {
        id: p.id,
        name: p.name,
        avatarUrl: p.avatar_url ?? null,
        gender: p.gender,
        age,
        isMinor: age != null && age < 18,
        createdAt: p.created_at,
        isTestAccount: !!p.is_test_account,
        isFreeAccount: !!p.is_free_account,
        mustChangePassword: !!p.must_change_password,
        lifetimeMatches: p.lifetime_matches ?? 0,
        seasonMatches: p.total_matches ?? 0,
      };
      // الهاتفُ والميلادُ والحسابُ الموظّفيُّ للأدمن وحدَه
      if (isAdmin) {
        identity.phone = p.phone;
        identity.dob = p.dob ?? null;
        identity.linkedStaffId = p.linked_staff_id ?? null;
      } else {
        identity.phoneTail = String(p.phone ?? '').slice(-4);
      }

      // ── البوّابةُ الأولى: القفل ──
      const lock: Row = { isLocked: !!p.is_locked, lockedAt: p.locked_at ?? null };
      if (lock.isLocked && isAdmin) {
        // 🔴 نصُّ السبب للأدمن وحدَه (قرارُ المالك). و١٣ قفلاً من ٢٢ بلا سببٍ
        //    مكتوب — تُقال الحقيقةُ صراحةً بدل تركِ الفراغ يوحي بوجود سبب.
        lock.reason = String(p.locked_reason ?? '').trim() || null;
        const by = p.locked_by
          ? one(await db.execute(sql`SELECT username FROM staff WHERE id = ${p.locked_by}`))
          : null;
        lock.byUsername = by?.username ?? null;
        const att = one(await db.execute(sql`
          SELECT count(*)::int AS n, count(*) FILTER (WHERE password_ok)::int AS ok
          FROM locked_login_attempts WHERE player_id = ${playerId}
        `));
        // «صاحبُ الحساب يستنجد»: محاولةٌ بكلمةِ سرٍّ صحيحةٍ على حسابٍ مقفول
        lock.attempts = att?.n ?? 0;
        lock.attemptsWithCorrectPassword = att?.ok ?? 0;
      }

      // ── البوّابةُ الثانية: الموقع ──
      // 🔴 يُقرأ الإعفاءُ مع الفشل: بدونه يقرأ الموظّفُ «فشلاً» وهو إعفاءٌ مقصود.
      const geo: Row = {
        exempt: !!p.geofence_exempt,
        exemptReason: p.geofence_exempt ? (p.geofence_exempt_reason ?? null) : null,
        recentFailures: [],
      };
      if (role !== 'accountant') {
        const fails = rows(await db.execute(sql`
          SELECT result, gate, distance_m, enforced, created_at
          FROM presence_checks
          WHERE player_id = ${playerId}
            AND result NOT IN ('OK','OK_STORED','EXEMPT','EXEMPT_PLAYER')
            ${activityId ? sql`AND activity_id = ${activityId}` : sql``}
          ORDER BY created_at DESC LIMIT 5
        `));
        geo.recentFailures = fails.map(f => ({
          result: f.result, gate: f.gate, distanceM: f.distance_m,
          enforced: !!f.enforced, at: f.created_at,
        }));
        // النوعُ الغالبُ يحدّد الفعلَ الصحيح: «لا يُعطي قراءة» ⇒ إعفاء،
        // و«بعيد» ⇒ إدخالٌ يدويّ. الإعفاءُ في الثانية يعالج العَرَضَ الخطأ.
        geo.dominant = fails.length ? fails[0].result : null;
      }

      // ── الحكم: ترتيبٌ ثابتٌ متنافٍ ──
      const verdict = lock.isLocked ? 'LOCKED'
        : (geo.recentFailures.length && !geo.exempt) ? 'GEO'
        : 'OK';

      // ── المال: الدَّينُ من ١/٩/٢٠٢٦ ──
      // 🔴 لا `bookings.paid_amount`: العمودُ يخزّن **المقبوض**، فمجموعُه على
      //    غير المدفوع صفرٌ رياضيٌّ حتميّ — وهو ما كان يُعرض. الاشتقاقُ الصحيح
      //    من `activities.base_price`. والبدايةُ ١/٩ قرارُ المالك: ٣٧٥ د.أ على
      //    ١٢٦ حجزاً بدل ١٦٩٩ على ٧٨٣ — لا مطالبةَ بأثرٍ رجعيّ.
      const debt = one(await db.execute(sql`
        SELECT COALESCE(SUM(COALESCE(a.base_price, '0')::numeric), 0)::float AS amount,
               count(*)::int AS bookings
        FROM bookings b JOIN activities a ON a.id = b.activity_id
        WHERE b.player_id = ${playerId}
          AND b.is_paid = false AND COALESCE(b.is_free, false) = false
          AND b.deleted_at IS NULL AND a.date >= ${DEBT_SINCE}::date
      `));

      // ── الوصول: هل يصله إشعار ──
      const push = one(await db.execute(sql`
        SELECT count(*)::int AS n, max(platform) AS platform
        FROM player_fcm_tokens WHERE player_id = ${playerId} AND is_active = true
      `));

      // ── المقعدُ والرفقة ──
      const seat: Row = { pinned: null, blocked: [] };
      if (role !== 'accountant') {
        if (activityId) {
          const a = one(await db.execute(sql`
            SELECT a.seat_assignments, t.pinned_seats
            FROM activities a LEFT JOIN seat_templates t ON t.id = a.seat_template_id
            WHERE a.id = ${activityId}
          `));
          if (a) {
            // 🔴 تُستعمل أداةُ الدمج والمطابقة القائمتان لا مطابقةٌ جديدة:
            //    `normPinPhone` تقشّر 00962/962 وتُرجع الصفرَ البادئ، وإعادةُ
            //    كتابتها تُنتج تطابقاً يخالف ما تراه غرفةُ اللعب.
            const merged = mergeActivityPins(a.pinned_seats ?? [], a.seat_assignments ?? []);
            const mine = merged.find((x: any) => samePinPerson(x, { playerId, phone: p.phone, playerName: p.name }));
            seat.pinned = mine ? Number(mine.seatNumber) : null;
          }
        }
        // الاتّجاهان معاً: الزوجُ يُكتب مرّةً واحدةً بترتيبٍ عشوائيّ
        seat.blocked = rows(await db.execute(sql`
          SELECT CASE WHEN player1_id = ${playerId} THEN player2_id ELSE player1_id END AS other_id,
                 CASE WHEN player1_id = ${playerId} THEN player2_name ELSE player1_name END AS other_name,
                 reason
          FROM blocked_pairs WHERE player1_id = ${playerId} OR player2_id = ${playerId}
        `)).map(b => ({ id: b.other_id, name: b.other_name, reason: b.reason ?? null }));
      }

      // ── الإيقاع: متى آخرُ ليلةٍ وكم فاصلُه المعتاد ──
      // 🔴 الصمتُ يُقاس بإيقاع اللاعب لا بالتقويم: وسيطُ الفارق بين ليلتين ٣
      //    أيّام، فصمتُ شهرٍ عشرةُ أضعافِ إيقاعِ الوفيّ وعاديٌّ تماماً لغيره.
      const nights = rows(await db.execute(sql`
        SELECT DISTINCT a.date::date AS d
        FROM bookings b JOIN activities a ON a.id = b.activity_id
        WHERE b.player_id = ${playerId} AND b.deleted_at IS NULL
        ORDER BY d DESC LIMIT 30
      `)).map(r => new Date(r.d));
      let rhythmDays: number | null = null;
      if (nights.length >= 3) {
        const gaps: number[] = [];
        for (let i = 1; i < nights.length; i++) {
          gaps.push(Math.round((+nights[i - 1] - +nights[i]) / 86400000));
        }
        gaps.sort((a, b) => a - b);
        rhythmDays = gaps[Math.floor(gaps.length / 2)] || null;
      }
      const lastNight = nights[0] ?? null;
      const daysSince = lastNight ? Math.round((Date.now() - +lastNight) / 86400000) : null;

      // ── لمحةُ لعب: ثلاثةُ صفوفٍ لا خمسون ──
      // 🔴 لا `reward_breakdown` هنا بحال: هو ٤٧ ك.ب من الحمولة القديمة،
      //    يُبنى لخمسين مباراةً ويُرمى. يُطلب عند نقر صفٍّ بعينه.
      let lastMatches: Row[] = [];
      if (role !== 'accountant') {
        lastMatches = rows(await db.execute(sql`
          SELECT mp.role, mp.survived_to_end, m.winner, m.created_at
          FROM match_players mp JOIN matches m ON m.id = mp.match_id
          WHERE mp.player_id = ${playerId} AND m.winner IS NOT NULL
          ORDER BY mp.id DESC LIMIT 3
        `)).map(r => {
          const team = teamOfRole(r.role);
          // الفوزُ رباعيٌّ — انظر عقودَ البيانات
          const won = r.winner === 'MAFIA' ? team === 'MAFIA'
            : r.winner === 'CITIZEN' ? team === 'CITIZEN'
            : r.winner === 'JESTER' ? r.role === 'JESTER'
            : r.winner === 'ASSASSIN' ? r.role === 'ASSASSIN'
            : false;
          return { role: r.role, team, won, survived: !!r.survived_to_end, at: r.created_at };
        });
      }

      return res.json({
        success: true,
        verdict,
        identity,
        lock,
        geo,
        money: {
          since: DEBT_SINCE,
          amount: Number(debt?.amount ?? 0),
          bookings: debt?.bookings ?? 0,
        },
        reach: { hasPush: (push?.n ?? 0) > 0, platform: push?.platform ?? null },
        seat,
        rhythm: { lastNight, daysSince, rhythmDays, totalNights: nights.length },
        lastMatches,
        viewerRole: role,
      });
    } catch (err: any) {
      console.error('❌ player card error:', err.message);
      return res.status(500).json({ success: false, error: 'خطأ في جلب البطاقة' });
    }
  },
);

export default router;
