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
               lifetime_matches, total_matches, chips_balance
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
        // 🔴 عملةٌ داخليّةٌ لا مال: أوسعُ تغطيةٍ في القاعدة (٦٩١ من ٧٧٣)،
        //    وتُسمّى «رقاقة» صراحةً في الواجهة كي لا تُخلط بالدينار.
        chipsBalance: p.chips_balance ?? 0,
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
        // 🔴 نافذةٌ زمنيّةٌ إلزاميّة: بدونها كان الاستعلامُ يجلب فشولَ **كلّ
        //    التاريخ**، فمن تعذّرت قراءةُ موقعه مرّةً في ١٢ آب يبقى شريطُه
        //    كهرمانيّاً إلى الأبد. القياسُ على الإنتاج: ٥٠ لاعباً يُشعلون
        //    العنبرَ بالمُسنَد القديم، وآخرُ فحصٍ فاشلٍ فعلاً **لواحد**.
        //    وشريطٌ يكذب على تسعةٍ وأربعين يُفقد الثقةَ في الشريط كلِّه.
        const fails = rows(await db.execute(sql`
          SELECT result, gate, distance_m, enforced, created_at
          FROM presence_checks
          WHERE player_id = ${playerId}
            AND result NOT IN ('OK','OK_STORED','EXEMPT','EXEMPT_PLAYER')
            ${activityId
              ? sql`AND activity_id = ${activityId}`
              : sql`AND created_at > NOW() - INTERVAL '24 hours'`}
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

      // ── حجزُ الليلة أو القادم ──
      // 🔴 هذا هو السؤالُ الأوّل الذي يُفتح لأجله الملفُّ عند الباب: أهو
      //    محجوزٌ أصلاً؟ والصفحةُ القديمة لا تجيب عنه إطلاقاً.
      const booking = one(await db.execute(sql`
        SELECT a.id AS activity_id, a.name, a.date, b.is_paid, b.is_free,
               b.checked_in, COALESCE(b.count, 1) AS seats
        FROM bookings b JOIN activities a ON a.id = b.activity_id
        WHERE b.player_id = ${playerId} AND b.deleted_at IS NULL
          AND a.date >= CURRENT_DATE
        ORDER BY a.date ASC LIMIT 1
      `));

      // ── آخرُ تقييمٍ كتبه ──
      // 🔴 ٤٤٤ من ٧٧٣ كتبوا تقييماً — أوسعُ محتوىً بشريٍّ في القاعدة، وكان
      //    بلا قارئ. وبعد رفع الحجب صار الاستبيانُ دعوةً، فقراءتُه ما يجعلها
      //    تستحقّ الإرسال.
      const fb = one(await db.execute(sql`
        SELECT overall, notes, played_at, submitted_at
        FROM room_feedback
        WHERE player_id = ${playerId} AND submitted_at IS NOT NULL
        ORDER BY submitted_at DESC LIMIT 1
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

      // ── ملاحظاتُ الموظّفين — للأدمن وحدَه ──
      let notes: Row[] = [];
      if (isAdmin) {
        notes = rows(await db.execute(sql`
          SELECT id, staff_username AS "staffUsername", text, created_at AS "createdAt"
          FROM player_notes WHERE player_id = ${playerId}
          ORDER BY created_at DESC LIMIT 20
        `));
      }

      return res.json({
        success: true,
        notes,
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
        booking: booking ? {
          activityId: booking.activity_id, name: booking.name, date: booking.date,
          isPaid: !!booking.is_paid, isFree: !!booking.is_free,
          checkedIn: !!booking.checked_in, seats: Number(booking.seats) || 1,
        } : null,
        feedback: fb ? {
          overall: fb.overall ?? null,
          notes: String(fb.notes ?? '').trim() || null,
          at: fb.submitted_at ?? fb.played_at,
        } : null,
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

// ══════════════════════════════════════════════════════
// 🗂️ الأقسامُ العميقة — تُطلب حين يُفتح لسانُها لا في كلّ فتحة
//
// 🔴 لماذا منفذٌ ثانٍ لا توسيعُ البطاقة: البطاقةُ تُفتح في كلّ مرّة، والأقسامُ
//    تُفتح أحياناً. ضمُّها إليها يعيد عطبَ المنفذ القديم نفسَه — ٦٧٫٨ ك.ب
//    في كلّ فتحةٍ، ٩٣٪ منها لا يُرى.
//
// 🔴 والحراسةُ على مستوى القسم في الخادم: ما لا يملكه الدورُ لا يُرسَل.
//    قسمُ الموقع لا يصل المحاسبَ أصلاً، ولا يُخفى في الواجهة.
// ══════════════════════════════════════════════════════

/** أدنى دورٍ لكلّ قسم — قراراتُ المالك مطبَّقة */
const SECTION_ROLES: Record<string, string[]> = {
  money:   ['admin', 'manager'],
  play:    ['admin', 'manager', 'accountant'],
  account: ['admin', 'manager', 'accountant'],
  seating: ['admin', 'manager'],
  geo:     ['admin', 'manager'],   // لا محاسب — الموقعُ لا يصله
};

router.get(
  '/player/:id/section/:key',
  authenticate,
  authorize('admin', 'manager', 'accountant'),
  async (req: Request, res: Response) => {
    const playerId = parseInt(req.params.id);
    const key = String(req.params.key);
    if (!playerId || isNaN(playerId)) {
      return res.status(400).json({ success: false, error: 'معرّف اللاعب غير صالح' });
    }
    const allowed = SECTION_ROLES[key];
    if (!allowed) return res.status(404).json({ success: false, error: 'قسمٌ غير معروف' });

    const role = req.user?.role ?? '';
    if (!allowed.includes(role)) {
      return res.status(403).json({ success: false, error: 'ليس لديك صلاحية لهذا القسم' });
    }
    const isAdmin = role === 'admin';

    const db = getDB();
    if (!db) return res.status(503).json({ success: false, error: 'قاعدة البيانات غير متوفرة' });

    try {
      const p = one(await db.execute(sql`
        SELECT id, name, phone, chips_balance, is_free_account
        FROM players WHERE id = ${playerId} AND deleted_at IS NULL
      `));
      if (!p) return res.status(404).json({ success: false, error: 'اللاعب غير موجود' });

      const out = await buildSection(db, key, playerId, p, isAdmin);
      return res.json({ success: true, key, ...out });
    } catch (err: any) {
      console.error('❌ section error:', key, err.message);
      return res.status(500).json({ success: false, error: 'خطأ في جلب القسم' });
    }
  },
);

async function buildSection(db: any, key: string, id: number, p: Row, isAdmin: boolean) {
  switch (key) {

    // ── 💵 المال ──
    case 'money': {
      // 🔴 الأرشيفُ يُعرض بوسمٍ وبلا زرِّ تحصيل (قرارُ المالك): ما قبل ١/٩ وقع
      //    في نظامٍ لم يكن يُعلَّم فيه الدفعُ أصلاً، فالمطالبةُ به ظلم.
      const debt = one(await db.execute(sql`
        SELECT
          COALESCE(SUM(a.base_price::numeric) FILTER (WHERE a.date >= ${DEBT_SINCE}::date), 0)::float AS live,
          count(*) FILTER (WHERE a.date >= ${DEBT_SINCE}::date)::int AS live_n,
          COALESCE(SUM(a.base_price::numeric) FILTER (WHERE a.date < ${DEBT_SINCE}::date), 0)::float AS arch,
          count(*) FILTER (WHERE a.date < ${DEBT_SINCE}::date)::int AS arch_n
        FROM bookings b JOIN activities a ON a.id = b.activity_id
        WHERE b.player_id = ${id} AND b.is_paid = false
          AND COALESCE(b.is_free, false) = false AND b.deleted_at IS NULL
      `));
      const paid = one(await db.execute(sql`
        SELECT
          COALESCE((SELECT SUM(paid_amount::numeric) FROM bookings
                    WHERE player_id = ${id} AND is_paid AND deleted_at IS NULL), 0)::float AS gate,
          COALESCE((SELECT SUM(total::numeric) FROM orders
                    WHERE player_id = ${id} AND status <> 'cancelled'), 0)::float AS menu
      `));
      // 🔴 الماءُ خارجَ التفضيل: يُضاف تلقائيّاً في كثيرٍ من الطلبات، فعدُّه
      //    تفضيلاً يجعله الصنفَ الأوّلَ لكلّ لاعبٍ في النادي.
      const items = rows(await db.execute(sql`
        SELECT oi.name_snapshot AS name, SUM(oi.quantity)::int AS n
        FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.player_id = ${id} AND o.status <> 'cancelled'
          AND oi.name_snapshot NOT ILIKE '%مياه%' AND oi.name_snapshot NOT ILIKE '%ماء%'
        GROUP BY 1 HAVING SUM(oi.quantity) >= 2 ORDER BY 2 DESC LIMIT 3
      `));
      const orders = one(await db.execute(sql`
        SELECT count(*)::int AS n, COALESCE(SUM(total::numeric), 0)::float AS sum
        FROM orders WHERE player_id = ${id} AND status <> 'cancelled'
      `));
      const freeNights = one(await db.execute(sql`
        SELECT count(*)::int AS n FROM bookings
        WHERE player_id = ${id} AND is_free AND deleted_at IS NULL
      `));
      return {
        debt: {
          live: Number(debt?.live ?? 0), liveN: debt?.live_n ?? 0,
          archive: Number(debt?.arch ?? 0), archiveN: debt?.arch_n ?? 0, since: DEBT_SINCE,
        },
        paid: {
          gate: Number(paid?.gate ?? 0), menu: Number(paid?.menu ?? 0),
          total: Number(paid?.gate ?? 0) + Number(paid?.menu ?? 0),
        },
        orders: { n: orders?.n ?? 0, sum: Number(orders?.sum ?? 0), top: items },
        free: { nights: freeNights?.n ?? 0, account: !!p.is_free_account },
        chips: Number(p.chips_balance ?? 0),
      };
    }

    // ── 🎭 اللعب ──
    case 'play': {
      const w = one(await db.execute(sql`
        SELECT
          (SELECT lifetime_matches FROM players WHERE id = ${id})::int AS lifetime,
          (SELECT total_matches FROM players WHERE id = ${id})::int AS season,
          (SELECT count(DISTINCT a.id) FROM bookings b JOIN activities a ON a.id = b.activity_id
           WHERE b.player_id = ${id} AND b.deleted_at IS NULL)::int AS nights,
          (SELECT min(a.date) FROM bookings b JOIN activities a ON a.id = b.activity_id
           WHERE b.player_id = ${id} AND b.deleted_at IS NULL) AS first_night
      `));
      const hist = rows(await db.execute(sql`
        SELECT m.created_at::date AS d, mp.role, m.winner, mp.survived_to_end,
               COALESCE(mp.penalty_count, 0)::int AS pen
        FROM match_players mp JOIN matches m ON m.id = mp.match_id
        WHERE mp.player_id = ${id} AND m.winner IS NOT NULL
        ORDER BY m.created_at DESC LIMIT 12
      `));
      const nights: Row[] = [];
      for (const r of hist) {
        const d = String(r.d);
        let n = nights.find(x => x.date === d);
        if (!n) { if (nights.length >= 3) continue; n = { date: d, matches: [] }; nights.push(n); }
        const team = teamOfRole(r.role);
        // الفوزُ رباعيٌّ — انظر عقودَ البيانات
        const won = r.winner === 'MAFIA' ? team === 'MAFIA'
          : r.winner === 'CITIZEN' ? team === 'CITIZEN'
          : r.winner === 'JESTER' ? r.role === 'JESTER'
          : r.winner === 'ASSASSIN' ? r.role === 'ASSASSIN' : false;
        n.matches.push({
          role: r.role, won, winner: r.winner,
          survived: !!r.survived_to_end, penalty: r.pen > 0,
        });
      }
      // 🔴 «ممنوعٌ من المافيا»: آخرُ ثلاثةِ أدوارٍ كلُّها مافيا ⇒ المحرّكُ
      //    يستبعده من التوزيع القادم. يُعرض في البطاقة وهنا معاً (قرارُ المالك).
      const last3 = hist.slice(0, 3).map(r => teamOfRole(r.role));
      const mafiaBan = last3.length === 3 && last3.every(t => t === 'MAFIA');
      // 🔴 العقوبةُ معدّلاً لا رقماً مطلقاً: «عقوبتان» تعني شيئاً لمن لعب ٥
      //    وشيئاً آخرَ تماماً لمن لعب ٢٠٠.
      const pen = one(await db.execute(sql`
        SELECT COALESCE(SUM(penalty_count), 0)::int AS n
        FROM match_players WHERE player_id = ${id} AND penalty_count > 0
      `));
      const lastPen = one(await db.execute(sql`
        SELECT m.created_at::date AS d, mp.role
        FROM match_players mp JOIN matches m ON m.id = mp.match_id
        WHERE mp.player_id = ${id} AND mp.penalty_count > 0
        ORDER BY m.created_at DESC LIMIT 1
      `));
      const deals = one(await db.execute(sql`
        SELECT COALESCE(total_deals, 0)::int AS n, COALESCE(successful_deals, 0)::int AS ok
        FROM players WHERE id = ${id}
      `));
      const life = Number(w?.lifetime ?? 0);
      const pn = Number(pen?.n ?? 0);
      return {
        weight: {
          lifetime: life, season: w?.season ?? 0,
          nights: w?.nights ?? 0, firstNight: w?.first_night ?? null,
        },
        nights, mafiaBan,
        penalties: {
          n: pn,
          perMatches: pn > 0 && life > 0 ? Math.round(life / pn) : null,
          last: lastPen ? { date: lastPen.d, role: lastPen.role } : null,
        },
        deals: { n: deals?.n ?? 0, ok: deals?.ok ?? 0 },
      };
    }

    // ── 🪪 الحساب ──
    case 'account': {
      const dev = one(await db.execute(sql`
        SELECT count(*)::int AS n, max(platform) AS platform, max(updated_at) AS seen
        FROM player_fcm_tokens WHERE player_id = ${id} AND is_active = true
      `));
      const acc = one(await db.execute(sql`
        SELECT created_at, must_change_password, is_test_account, gender_constraint,
               linked_staff_id, last_active_at, last_active_source, dob
        FROM players WHERE id = ${id}
      `));
      const consent = one(await db.execute(sql`
        SELECT kind, version, action, guardian_name, created_at
        FROM player_consents WHERE player_id = ${id}
        ORDER BY created_at DESC LIMIT 1
      `));
      const staff = acc?.linked_staff_id
        ? one(await db.execute(sql`SELECT username, role FROM staff WHERE id = ${acc.linked_staff_id}`))
        : null;
      // 🔴 التوأمُ الهاتفيّ: آخرُ ٩ خاناتٍ بعد تحويل الأرقام العربيّة الهنديّة —
      //    سبعُ مجموعاتٍ في الإنتاج، وواحدةٌ منها شخصان مختلفان يتشاركان هاتفاً.
      const twin = one(await db.execute(sql`
        SELECT p2.id, p2.name, COALESCE(p2.lifetime_matches, 0)::int AS m, p2.created_at
        FROM players p2
        WHERE p2.id <> ${id} AND p2.deleted_at IS NULL
          AND length(regexp_replace(translate(p2.phone, '٠١٢٣٤٥٦٧٨٩', '0123456789'), '[^0-9]', '', 'g')) >= 9
          AND right(regexp_replace(translate(p2.phone, '٠١٢٣٤٥٦٧٨٩', '0123456789'), '[^0-9]', '', 'g'), 9)
            = right(regexp_replace(translate(${String(p.phone ?? '')}, '٠١٢٣٤٥٦٧٨٩', '0123456789'), '[^0-9]', '', 'g'), 9)
        LIMIT 1
      `));
      return {
        device: { n: dev?.n ?? 0, platform: dev?.platform ?? null, seen: dev?.seen ?? null },
        account: {
          joined: acc?.created_at ?? null,
          mustChangePassword: !!acc?.must_change_password,
          isTestAccount: !!acc?.is_test_account,
          genderConstraint: acc?.gender_constraint ?? 'NONE',
          lastActive: acc?.last_active_at ?? null,
          lastActiveSource: acc?.last_active_source ?? null,
          // الميلادُ للأدمن وحدَه (قرارُ المالك)
          dob: isAdmin ? (acc?.dob ?? null) : null,
        },
        linkedStaff: staff && isAdmin ? { username: staff.username, role: staff.role } : null,
        consent: consent ? {
          kind: consent.kind, version: consent.version, action: consent.action,
          hasGuardian: !!consent.guardian_name, at: consent.created_at,
        } : null,
        twin: twin ? { id: twin.id, name: twin.name, matches: twin.m, at: twin.created_at } : null,
      };
    }

    // ── 💺 الإجلاس ──
    case 'seating': {
      const blocked = rows(await db.execute(sql`
        SELECT CASE WHEN player1_id = ${id} THEN player2_id ELSE player1_id END AS oid,
               CASE WHEN player1_id = ${id} THEN player2_name ELSE player1_name END AS oname,
               reason
        FROM blocked_pairs WHERE player1_id = ${id} OR player2_id = ${id} LIMIT 12
      `));
      // 🔴 الرفقةُ **بالرفع** لا بعدد الليالي المشتركة. قِستُ الفخَّ على الإنتاج
      //    قبل الإصلاح: خمسةُ لاعبين مختلفين، ورفيقُهم الأوّلُ من ثلاثةِ أسماءٍ
      //    متكرّرة — لأنّ أكثرَ الناس حضوراً يشارك الجميعَ أكثرَ لياليهم بحكم
      //    الحضور وحدَه. «يأتي دائماً مع فلان» كانت ستُقال عن أنشطِ لاعبٍ للكلّ.
      //
      //    الرفعُ = المشتركُ الفعليّ ÷ المشتركِ المتوقَّع بالصدفة
      //           = shared ÷ (ليالي · ليالي الآخر ÷ ليالي النادي كلِّها)
      //    وقيمةُ ١ تعني «كما تتوقّع الصدفةُ تماماً»، والعتبةُ ١٫٥ فأعلى.
      const comp = rows(await db.execute(sql`
        WITH mine AS (
          SELECT DISTINCT activity_id AS aid FROM bookings
          WHERE player_id = ${id} AND deleted_at IS NULL),
        allnights AS (SELECT count(DISTINCT activity_id)::numeric AS n FROM bookings WHERE deleted_at IS NULL),
        myn AS (SELECT count(*)::numeric AS n FROM mine),
        pairs AS (
          SELECT b.player_id AS oid, count(DISTINCT b.activity_id)::numeric AS shared
          FROM bookings b WHERE b.activity_id IN (SELECT aid FROM mine)
            AND b.player_id <> ${id} AND b.player_id IS NOT NULL AND b.deleted_at IS NULL
          GROUP BY 1),
        theirs AS (
          SELECT player_id AS oid, count(DISTINCT activity_id)::numeric AS n
          FROM bookings WHERE deleted_at IS NULL AND player_id IS NOT NULL GROUP BY 1)
        SELECT pr.oid, p2.name AS oname, pr.shared::int AS shared,
               myn.n::int AS of_nights,
               round(pr.shared / NULLIF(myn.n * t.n / an.n, 0), 2)::float AS lift
        FROM pairs pr
        JOIN theirs t ON t.oid = pr.oid
        JOIN players p2 ON p2.id = pr.oid AND p2.deleted_at IS NULL
        CROSS JOIN allnights an CROSS JOIN myn
        WHERE pr.shared >= 3 AND myn.n >= 3
          AND pr.shared / NULLIF(myn.n * t.n / an.n, 0) >= 1.5
        ORDER BY lift DESC LIMIT 3
      `));
      const myNights = one(await db.execute(sql`
        SELECT count(DISTINCT a.id)::int AS n FROM bookings b JOIN activities a ON a.id = b.activity_id
        WHERE b.player_id = ${id} AND b.deleted_at IS NULL
      `));
      const follows = one(await db.execute(sql`
        SELECT (SELECT count(*) FROM player_follows WHERE follower_id = ${id})::int AS out_n,
               (SELECT count(*) FROM player_follows WHERE following_id = ${id})::int AS in_n
      `));
      const fb = rows(await db.execute(sql`
        SELECT overall, notes, submitted_at FROM room_feedback
        WHERE player_id = ${id} AND submitted_at IS NOT NULL
          AND COALESCE(notes, '') <> '' ORDER BY submitted_at DESC LIMIT 2
      `));
      const notes = rows(await db.execute(sql`
        SELECT id, staff_username AS "staffUsername", text, created_at AS "createdAt"
        FROM player_notes WHERE player_id = ${id} ORDER BY created_at DESC LIMIT 10
      `));
      return {
        blocked: blocked.map(b => ({ id: b.oid, name: b.oname, reason: b.reason ?? null })),
        companions: comp.map(c => ({
          id: c.oid, name: c.oname, shared: c.shared,
          of: c.of_nights ?? myNights?.n ?? 0, lift: c.lift,
        })),
        follows: { out: follows?.out_n ?? 0, in: follows?.in_n ?? 0 },
        feedback: fb.map(f => ({ overall: f.overall, notes: f.notes, at: f.submitted_at })),
        notes,
      };
    }

    // ── 📍 الموقع ──
    case 'geo': {
      // 🔴 الموثوقيّةُ بالليالي لا بالمحاولات: ليلةٌ فيها ٣٥ محاولةً ليلةٌ
      //    واحدةٌ متعثّرة، وعدُّها ٣٥ فشلاً يجعل لاعباً واحداً يبدو كارثة.
      const rel = one(await db.execute(sql`
        SELECT count(DISTINCT activity_id)::int AS nights,
               count(DISTINCT activity_id) FILTER (
                 WHERE result NOT IN ('OK','OK_STORED','EXEMPT','EXEMPT_PLAYER'))::int AS bad,
               count(*)::int AS checks
        FROM presence_checks WHERE player_id = ${id}
      `));
      const worst = one(await db.execute(sql`
        SELECT activity_id, count(*)::int AS n, max(created_at) AS at
        FROM presence_checks WHERE player_id = ${id}
        GROUP BY 1 ORDER BY 2 DESC LIMIT 1
      `));
      const lastFail = one(await db.execute(sql`
        SELECT result, distance_m, created_at FROM presence_checks
        WHERE player_id = ${id} AND result NOT IN ('OK','OK_STORED','EXEMPT','EXEMPT_PLAYER')
        ORDER BY created_at DESC LIMIT 1
      `));
      const ex = one(await db.execute(sql`
        SELECT geofence_exempt, geofence_exempt_reason, geofence_exempt_at, geofence_exempt_by
        FROM players WHERE id = ${id}
      `));
      const exBy = ex?.geofence_exempt_by
        ? one(await db.execute(sql`SELECT username FROM staff WHERE id = ${ex.geofence_exempt_by}`))
        : null;
      const fix = one(await db.execute(sql`
        SELECT latitude, longitude, accuracy_m, is_mocked, source, captured_at
        FROM player_last_fix WHERE player_id = ${id}
      `));
      const trail = one(await db.execute(sql`
        SELECT count(*)::int AS n FROM player_fixes WHERE player_id = ${id}
      `));
      // 🔴 الحالةُ الرابعة تُعرض صراحةً (قرارُ المالك): ٨٩ فعاليّةً من ١٠١
      //    بسياجٍ مُطفأ — وطيُّ القسم عندها يترك الموظّفَ يظنّ العطبَ في اللاعب.
      const tonight = one(await db.execute(sql`
        SELECT id, name, geofence_enabled FROM activities
        WHERE date::date = CURRENT_DATE AND deleted_at IS NULL
        ORDER BY id DESC LIMIT 1
      `));
      return {
        reliability: { nights: rel?.nights ?? 0, badNights: rel?.bad ?? 0, checks: rel?.checks ?? 0 },
        worstStorm: worst ? { checks: worst.n, at: worst.at } : null,
        lastFail: lastFail
          ? { result: lastFail.result, distanceM: lastFail.distance_m, at: lastFail.created_at }
          : null,
        exempt: ex?.geofence_exempt
          ? { reason: ex.geofence_exempt_reason ?? null, at: ex.geofence_exempt_at ?? null, by: exBy?.username ?? null }
          : null,
        // 🔴 عمرُ القراءة أوّلاً: التطبيقُ لا يُبلّغ في الخلفيّة، فنقطةُ من أغلقه
        //    تتجمّد حيث كان — وموقعٌ بلا عمرِه خريطةٌ كاذبةٌ بثقة.
        lastFix: fix ? {
          accuracyM: fix.accuracy_m, isMocked: !!fix.is_mocked,
          source: fix.source, capturedAt: fix.captured_at,
          lat: isAdmin ? fix.latitude : null, lng: isAdmin ? fix.longitude : null,
        } : null,
        trailPoints: trail?.n ?? 0,
        tonight: tonight
          ? { id: tonight.id, name: tonight.name, geofenceEnabled: !!tonight.geofence_enabled }
          : null,
      };
    }

    default:
      return {};
  }
}

export default router;
