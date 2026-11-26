// ══════════════════════════════════════════════════════
// 🔮 الكشف بعد اللعبة (قرار المالك ٣١) — سطورٌ عربيّة من حمولة game:over.prophecyReveal
// المصدر: backend/src/game/prophecy-reveal.ts. بعد النهاية كلّ شيءٍ علنيّ، فالسطور واحدة
// للموجّه والشاشة والهواتف.
// ══════════════════════════════════════════════════════

export interface RevealLine { icon: string; title: string; text: string }

const OUTCOME_AR: Record<string, string> = {
  TRUE: 'صدقت', FALSE: 'كذبت', NOT_PASSED: 'لم تمرّ', WITHDRAWN: 'أحرقها بحقّ الشكّ',
  VETOED: 'نقضها العمدة', GUARANTEED: 'كفل الكفيلُ صاحبها', BURNED_NIGHT: 'احترقت ليلاً', REMOVED: 'أُزيلت',
};
const seatName = (seat: any, name: any) => (seat == null ? '—' : `${seat}${name ? ` ${name}` : ''}`);

export function prophecyRevealLines(rv: any, nameOf?: (seat: number) => string): RevealLine[] {
  if (!rv) return [];
  const nm = (seat: any, given?: string) => seatName(seat, given || (seat != null && nameOf ? nameOf(Number(seat)) : ''));
  const out: RevealLine[] = [];

  for (const m of rv.masks || []) {
    let text = `وضع المُضلّل قناعه على ${nm(m.targetPhysicalId, m.targetName)}`;
    if (m.lifted) text += ' — وسقط حين عبر صاحبه إلى المافيا';
    else if (m.burned) {
      text += m.burnedBy === 'ORACLE' ? ' — وسُحب في صندوق العرّاف' : ` — ورآه الشريف ${m.shownAs === 'MAFIA' ? 'مافيا' : 'مواطناً'}`;
      if (m.executedBecauseOfMask) text += ' — وأعدمته المدينة بعدها: تلفيقٌ نافذ';
    } else text += ' — ولم يقرأه أحد';
    out.push({ icon: '🎭', title: 'القناع', text });
  }

  const o = rv.oracle;
  if (o) {
    const box = (b: any) => (b === 'B' ? 'ب' : 'أ');
    let text = `العرّاف ${nm(o.oraclePhysicalId, o.oracleName)}: «أ» ${nm(o.boxes?.A?.physicalId, o.boxes?.A?.name)} · «ب» ${nm(o.boxes?.B?.physicalId, o.boxes?.B?.name)} — المافيا في «${box(o.mafiaBox)}»`;
    if (o.chosenBox) text += `، وفتح «${box(o.chosenBox)}»`;
    text += ` · النبوءة ${OUTCOME_AR[o.outcome] || o.outcome || '—'}`;
    if (o.testamentPhysicalId != null) text += ` · الوصيّة: ${nm(o.testamentPhysicalId)}`;
    out.push({ icon: '📜', title: 'الصندوقان', text });
  }

  const c = rv.cup;
  if (c) {
    const hits: number[] = c.hits || [];
    let text = `القارئة ${nm(c.readerPhysicalId)}: صدقت ${hits.length} من ${c.threshold}${hits.length ? ` (${hits.join('، ')})` : ''}`;
    if (c.departed) text += ' — ورحلت فائزة';
    if (c.sealPhysicalId != null) text += c.sealOutcome === 'EXECUTED' ? ` · ختمت ${nm(c.sealPhysicalId)} فأُعدم` : ` · ختمت ${nm(c.sealPhysicalId)} فاحترق الختم`;
    out.push({ icon: '☕', title: 'الفنجان', text });
  }

  const d = rv.divided;
  if (d) {
    const text = d.choice === 'MAFIA' ? `المنقسم ${nm(d.dividedPhysicalId, d.name)} عبر إلى المافيا`
      : d.choice === 'CITY' ? `المنقسم ${nm(d.dividedPhysicalId, d.name)} بقي مع المدينة${d.defaulted ? ' (لم يختر)' : ''}`
      : `المنقسم ${nm(d.dividedPhysicalId, d.name)} خرج قبل أن يختار`;
    out.push({ icon: '⚖️', title: 'الانقسام', text });
  }

  const g = rv.guarantor;
  if (g) {
    const r = g.result;
    const text = !g.used ? `الكفيل ${nm(g.guarantorPhysicalId)} لم يكفل أحداً`
      : r?.outcome === 'SAVED' ? `الكفيل ${nm(g.guarantorPhysicalId)} كفل ${nm(r.targetPhysicalId)} فنجا${r.dealCancelled ? ' وأُلغيت الصفقة' : ''}`
      : `الكفيل ${nm(g.guarantorPhysicalId)} كفل ${nm(r?.targetPhysicalId)} فأُعدم ومات الكفيل معه`;
    out.push({ icon: '🤝', title: 'الكفالة', text });
  }
  return out;
}

// ── آخر نهاية لعبة (للهاتف): PlayerFlow يحفظها عند game:over، وشاشة النهاية تقرؤها ──
let _last: { reveal: any; ledger: any } | null = null;
export function setLastProphecy(data: any) { _last = data?.prophecyReveal || data?.prophecyLedger ? { reveal: data.prophecyReveal || null, ledger: data.prophecyLedger || null } : null; }
export function getLastProphecy() { return _last; }
/** «كتبت هذه الليلة سطراً في مخطوطة الصدق» — أو في الأخرى (قرار ٣٣) */
export function ledgerSentence(ledger: any): string | null {
  if (!ledger?.line) return null;
  return ledger.line === 'TRUTH' ? 'كتبت هذه الليلة سطراً في مخطوطة الصدق' : 'كتبت هذه الليلة سطراً في مخطوطة القناع';
}
