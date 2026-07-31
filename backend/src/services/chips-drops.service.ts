// ══════════════════════════════════════════════════════
// 💧 قطرات التشبس — المكافآت المجانية بنهاية المباراة
//
// القيم مقفلة (أرتفاكت v4):
//   فوز +2 🪙 · توب-3 على صافي الرانك +3 · أول مباراة +10
//   بالمواسم العادية فقط · إشعار إلزامي لكل قطرة.
//
// 🔒 الأمان: كل قطرة لها مفتاح منع تكرار
//    `drop:{matchId}:{playerId}:{type}` — فحتى لو استُدعيت الدالة
//    عشر مرات لنفس المباراة (مسارات النهاية متعددة) لا يُمنح شيء مرتين.
// ══════════════════════════════════════════════════════

import { applyChipsTx } from './chips.service.js';
import { getRewardsConfig } from './chips-rewards.service.js';

// ⚠️ هذه الثوابت صارت **افتراضياً فقط**. القيم الفعلية تُقرأ من إعدادات
//    المكافآت في القاعدة عند كل مباراة، فضبط أكبر صنبور إصدار في الاقتصاد
//    — أو إيقافه — لم يعد يحتاج نشرة كود.
export const DROP_WIN = 2;
export const DROP_TOP3 = 3;
export const DROP_FIRST_MATCH = 10;

export interface DropPlayerInput {
  playerId: number | null | undefined;
  /** صافي الرانك من هذه المباراة — أساس ترتيب التوب-3 (قرار مقفل) */
  rrChange?: number | null;
  /** هل فاز فريقه */
  won?: boolean;
  /** عدد مبارياته قبل هذه المباراة (0 = أول مباراة له) */
  lifetimeMatchesBefore?: number | null;
  name?: string | null;
}

export interface DropsResult {
  granted: Array<{ playerId: number; amount: number; type: string }>;
  skipped: string | null;
}

/**
 * منح قطرات نهاية المباراة.
 * تُستدعى من finalizeMatch بعد ضمان حفظ صفوف المباراة.
 * لا ترمي أبداً — القطرات مكافأة، وفشلها يجب ألا يُفشل إنهاء مباراة.
 */
export async function grantMatchDrops(opts: {
  matchId: number;
  players: DropPlayerInput[];
  /** true فقط للمواسم العادية (لا بطولات ولا أونلاين) */
  isRegularSeason: boolean;
  /** مباراة اختبارية → لا قطرات */
  isTestMatch?: boolean;
}): Promise<DropsResult> {
  const out: DropsResult = { granted: [], skipped: null };

  try {
    if (!opts.matchId) { out.skipped = 'no-match-id'; return out; }
    if (opts.isTestMatch) { out.skipped = 'test-match'; return out; }
    if (!opts.isRegularSeason) { out.skipped = 'not-regular-season'; return out; }

    // اللاعبون المسجَّلون فقط (سياسة النادي: لا لعب بلا حساب — هذا حارس دفاعي)
    const rows = (opts.players || []).filter(p => !!p?.playerId) as Required<DropPlayerInput>[];
    if (rows.length === 0) { out.skipped = 'no-registered-players'; return out; }

    // القيم من اللوحة (وإن تعذّرت القراءة فالافتراضي المقفل — القطرة لا تُفشل مباراة)
    const cfg = await getRewardsConfig().catch(() => null);
    const AMT = {
      enabled: cfg?.drops?.enabled ?? true,
      win: cfg?.drops?.win ?? DROP_WIN,
      top3: cfg?.drops?.top3 ?? DROP_TOP3,
      firstMatch: cfg?.drops?.firstMatch ?? DROP_FIRST_MATCH,
    };
    if (!AMT.enabled) { out.skipped = 'drops-disabled'; return out; }

    // ── ترتيب التوب-3 على صافي الرانك (rrChange) ──
    // التعادل عند الحدّ: كل المتعادلين على قيمة المركز الثالث يأخذون القطرة
    // (أعدل من قطع عشوائي، وكلفته ضئيلة).
    const sorted = [...rows].sort((a, b) => (Number(b.rrChange) || 0) - (Number(a.rrChange) || 0));
    const thirdValue = sorted.length >= 3 ? (Number(sorted[2].rrChange) || 0) : null;
    const top3Ids = new Set(
      thirdValue == null
        ? sorted.map(p => p.playerId as number)
        : sorted.filter(p => (Number(p.rrChange) || 0) >= thirdValue && (Number(p.rrChange) || 0) > 0)
                .map(p => p.playerId as number),
    );

    for (const p of rows) {
      const pid = Number(p.playerId);
      const drops: Array<{ type: string; amount: number; title: string; body: string }> = [];

      if (p.won && AMT.win > 0) {
        drops.push({
          type: 'win', amount: AMT.win,
          title: `🏆 +${AMT.win} 🪙 قطرة فوز`,
          body: 'فاز فريقك الليلة — أُضيفت لمحفظتك',
        });
      }
      if (top3Ids.has(pid) && AMT.top3 > 0) {
        drops.push({
          type: 'top3', amount: AMT.top3,
          title: `🥉 +${AMT.top3} 🪙 من الأفضل ثلاثة`,
          body: 'أداؤك وضعك ضمن الثلاثة الأوائل بصافي النقاط',
        });
      }
      if (Number(p.lifetimeMatchesBefore ?? 1) === 0 && AMT.firstMatch > 0) {
        drops.push({
          type: 'first_match', amount: AMT.firstMatch,
          title: `🎉 +${AMT.firstMatch} 🪙 هدية أول مباراة`,
          body: 'أهلاً بك في العائلة — افتح خزنة الدون واختر مظهرك',
        });
      }

      for (const d of drops) {
        const res = await applyChipsTx({
          playerId: pid,
          amount: d.amount,
          reason: d.type === 'win' ? 'drop_win' : d.type === 'top3' ? 'drop_top3' : 'drop_first_match',
          idempotencyKey: `drop:${opts.matchId}:${pid}:${d.type}`,
          refType: 'match',
          refId: String(opts.matchId),
          notify: { title: d.title, body: d.body },
        });
        if (res.ok && !res.duplicate) {
          out.granted.push({ playerId: pid, amount: d.amount, type: d.type });
        }
      }
    }

    if (out.granted.length) {
      const total = out.granted.reduce((s, g) => s + g.amount, 0);
      console.log(`💧 Chips drops for match ${opts.matchId}: ${out.granted.length} drop(s), ${total} 🪙`);
    }
    return out;
  } catch (e: any) {
    console.warn('⚠️ grantMatchDrops:', e?.message);
    out.skipped = 'error';
    return out;
  }
}
