// ══════════════════════════════════════════════════════
// 🪑 فحص تعارض تثبيت لاعب في مقعد — دالّة نقيّة مشتركة
// (قيود الجنس للجيران المباشرين + الأزواج الممنوعة ضمن مسافة مقعدين)
// مستخرَجة من محرّر القالب لإعادة استخدامها في تخصيص مقاعد النشاط.
// ══════════════════════════════════════════════════════

export type PinRef = { playerId?: number | null; phone?: string; playerName?: string };
export interface PlayerLite { id: number; name?: string; phone?: string; gender?: string; genderConstraint?: string }
export interface BlockedPairRow { player1_id: number; player1_phone?: string; player2_id: number; player2_phone?: string }

export function normPhone(ph?: string): string {
  if (!ph) return '';
  let c = ph.replace(/[\s\-()+]/g, '');
  if (c.startsWith('00962')) c = c.slice(5); else if (c.startsWith('962')) c = c.slice(3);
  return c.startsWith('0') ? c : '0' + c;
}

const genderAr = (g?: string) => (g || '').toUpperCase() === 'FEMALE' ? 'أنثى' : (g || '').toUpperCase() === 'MALE' ? 'ذكر' : '';
const circDist = (a: number, b: number, total: number) => { const d = Math.abs(a - b); return Math.min(d, total - d); };

function lookupPlayer(players: PlayerLite[], ref: { playerId?: number | null; phone?: string }): PlayerLite | null {
  if (ref.playerId != null) { const f = players.find(p => p.id === ref.playerId); if (f) return f; }
  const ph = normPhone(ref.phone);
  if (ph) { const f = players.find(p => normPhone(p.phone) === ph); if (f) return f; }
  return null;
}

/** يرجع قائمة رسائل التعارض عند تثبيت «cand» في المقعد targetSeat (فارغة = لا تعارض). */
export function checkSeatConflicts(opts: {
  targetSeat: number;
  cand: { playerId?: number; phone?: string; name: string; gender?: string; genderConstraint?: string };
  occupiedBySeat: Map<number, PinRef>;   // المقاعد المشغولة الفعليّة (عدا الهدف)
  players: PlayerLite[];
  blockedPairs: BlockedPairRow[];
  total: number;
}): string[] {
  const { targetSeat, cand, occupiedBySeat, players, blockedPairs, total } = opts;
  if (!total || total < 2) return [];
  const conflicts: string[] = [];
  const candGender = (cand.gender || '').toUpperCase();
  const candRule = cand.genderConstraint || 'NONE';
  const candPhone = normPhone(cand.phone);

  // 1) قيود الجنس — الجيران المباشرون (يسار/يمين)
  const left = targetSeat === 1 ? total : targetSeat - 1;
  const right = targetSeat === total ? 1 : targetSeat + 1;
  for (const ns of [left, right]) {
    const pin = occupiedBySeat.get(ns); if (!pin) continue;
    const nb = lookupPlayer(players, pin);
    const nbGender = (nb?.gender || '').toUpperCase();
    const nbRule = nb?.genderConstraint || 'NONE';
    const nbName = pin.playerName || nb?.name || `مقعد ${ns}`;
    if (!candGender || !nbGender) continue; // جنس غير معروف (اسم يدويّ) → تخطّ
    if (candRule === 'FORBID_SAME' && candGender === nbGender)
      conflicts.push(`«${cand.name}» ممنوع مجاورة نفس الجنس — الجار «${nbName}» (${genderAr(nbGender)}) بالمقعد ${ns}`);
    if (candRule === 'FORBID_OPPOSITE' && candGender !== nbGender)
      conflicts.push(`«${cand.name}» ممنوع مجاورة الجنس الآخر — الجار «${nbName}» (${genderAr(nbGender)}) بالمقعد ${ns}`);
    if (nbRule === 'FORBID_SAME' && nbGender === candGender)
      conflicts.push(`الجار «${nbName}» (بالمقعد ${ns}) ممنوع مجاورة نفس الجنس — و«${cand.name}» مِثله`);
    if (nbRule === 'FORBID_OPPOSITE' && nbGender !== candGender)
      conflicts.push(`الجار «${nbName}» (بالمقعد ${ns}) ممنوع مجاورة الجنس الآخر — و«${cand.name}» مختلف`);
  }

  // 2) الأزواج الممنوعة — ضمن مسافة مقعدين
  if (blockedPairs.length > 0 && (cand.playerId != null || candPhone)) {
    occupiedBySeat.forEach((pin, ns) => {
      if (ns === targetSeat) return;
      if (circDist(targetSeat, ns, total) > 2) return;
      const nb = lookupPlayer(players, pin);
      const nbId = nb?.id ?? pin.playerId ?? undefined;
      const nbPhone = normPhone(pin.phone || nb?.phone);
      const isBlocked = blockedPairs.some(bp => {
        const ph1 = normPhone(bp.player1_phone), ph2 = normPhone(bp.player2_phone);
        const candIs1 = (cand.playerId != null && bp.player1_id === cand.playerId) || (!!candPhone && ph1 === candPhone);
        const candIs2 = (cand.playerId != null && bp.player2_id === cand.playerId) || (!!candPhone && ph2 === candPhone);
        const nbIs1 = (nbId != null && bp.player1_id === nbId) || (!!nbPhone && ph1 === nbPhone);
        const nbIs2 = (nbId != null && bp.player2_id === nbId) || (!!nbPhone && ph2 === nbPhone);
        return (candIs1 && nbIs2) || (candIs2 && nbIs1);
      });
      if (isBlocked) {
        const nbName = pin.playerName || nb?.name || `مقعد ${ns}`;
        conflicts.push(`زوج ممنوع: «${cand.name}» و«${nbName}» على بُعد ${circDist(targetSeat, ns, total)} مقعد فقط (المقعد ${ns}) — المطلوب 3 مقاعد`);
      }
    });
  }
  return conflicts;
}
