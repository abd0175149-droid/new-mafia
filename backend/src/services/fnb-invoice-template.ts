// ══════════════════════════════════════════════════════
// 🗂️ قالب الفاتورة «ملفّ القضيّة» — 2026-10-30 (التصميم المعتمد على اللوحة)
// كلّ لاعبٍ مشتبهٌ به حتّى آخر الليل: المحصَّلة ملفٌّ أُغلق («القضيّة مُغلقة»)،
// والمفتوحة ملصق «مطلوب». نسختان من البيانات نفسها:
//   • A6 (PDF عبر Puppeteer) — ملفٌّ ورقيّ بلسانٍ ومشبكٍ وختمٍ أحمر، للمشاركة والأرشيف.
//   • إيصال 80مم — أسود على أبيض لطابعة الكاش، يُطبع من نافذة المتصفّح.
// الخطوط والختم مضمَّنة (base64) من src/assets/invoice: الحاوية لا تملك خطّ الرقعة،
// وطابعة الكاش لا يُضمن أن تصل الإنترنت — فالقالب لا يجلب شيئاً من الخارج.
// ══════════════════════════════════════════════════════

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { sql } from 'drizzle-orm';
import type { Database } from '../config/db.js';
import type { InvoiceData } from './fnb-invoice.service.js';
import { ROLE_NAMES_AR, isMafiaRole } from '../game/roles.js';

const ASSETS = fileURLToPath(new URL('../assets/invoice/', import.meta.url));

let fontCss: string | null = null;
let sealUri: string | null = null;
/** @font-face مضمَّنة — تُقرأ مرّةً واحدة ثمّ تُحفظ */
function fonts(): string {
  if (fontCss) return fontCss;
  const ff = (family: string, file: string, weight: number) => {
    const b64 = readFileSync(ASSETS + file).toString('base64');
    return `@font-face{font-family:"${family}";src:url(data:font/ttf;base64,${b64}) format("truetype");font-weight:${weight};font-display:block}`;
  };
  fontCss = [
    ff('MC Ruqaa', 'ArefRuqaa-Bold.ttf', 700),
    ff('MC Type', 'CourierPrime-Bold.ttf', 700),
    ff('MC Sans', 'Tajawal-Regular.ttf', 400),
    ff('MC Sans', 'Tajawal-Bold.ttf', 700),
    ff('MC Sans', 'Tajawal-ExtraBold.ttf', 800),
    ff('MC Sans', 'Tajawal-Black.ttf', 900),
  ].join('\n');
  return fontCss;
}
function seal(): string {
  if (!sealUri) sealUri = `data:image/png;base64,${readFileSync(ASSETS + 'seal-black.png').toString('base64')}`;
  return sealUri;
}

// ── «سجلّك الليلة» ───────────────────────────────────
export interface NightRecord { games: number; wins: number; lastRole: string | null }

/**
 * ألعاب اللاعب المنتهية في الفعاليّة: عددها، وما فاز به، وآخر دورٍ لعبه.
 * المنتهية فقط (is_active=false وفيها فائز) — فالفاتورة لا تكشف دور لعبةٍ ما زالت قائمة.
 * قاعدة الفوز نفسها في progression.service: المحايد يفوز بفوز فريقه وحده.
 */
export async function nightRecordOf(db: Database, activityId: number, playerId: number): Promise<NightRecord | null> {
  const r: any = await db.execute(sql`
    SELECT mp.role, m.winner FROM match_players mp
    JOIN matches m ON m.id = mp.match_id
    JOIN sessions s ON s.id = m.session_id
    WHERE s.activity_id = ${activityId} AND mp.player_id = ${playerId}
      AND m.is_active = false AND m.winner IS NOT NULL AND m.deleted_at IS NULL
    ORDER BY m.created_at, m.id
  `);
  const rows: { role: string; winner: string }[] = r?.rows ?? r ?? [];
  if (rows.length === 0) return null;
  const won = (role: string, winner: string) => {
    if (role === 'JESTER') return winner === 'JESTER';
    if (role === 'ASSASSIN') return winner === 'ASSASSIN';
    if (winner === 'JESTER' || winner === 'ASSASSIN') return false;
    return (winner === 'MAFIA') === isMafiaRole(role as any);
  };
  const known = rows.filter(x => (ROLE_NAMES_AR as Record<string, string>)[x.role]);
  const last = known[known.length - 1];
  return {
    games: rows.length,
    wins: rows.filter(x => won(x.role, x.winner)).length,
    lastRole: last ? (ROLE_NAMES_AR as Record<string, string>)[last.role] : null,
  };
}

// ── أدوات ─────────────────────────────────────────────
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** الإيموجي في الأسماء لا خطّ له في الحاوية ولا في الطابعة — يُحذف من المطبوع وحده */
const clean = (s: string) => String(s || '').replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim();
const fmt = (n: number) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
const n = (s: string | number) => `<span class="n">${esc(String(s))}</span>`;
const pad = (x: number, w: number) => String(x).padStart(w, '0');

function dayDate(d: Date): string {
  const day = d.toLocaleDateString('ar-JO', { weekday: 'long', timeZone: 'Asia/Amman' });
  const dmy = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Amman' });
  return `${day} ${n(dmy)}`;
}
const hm = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Amman' });

interface View {
  no: string; paid: boolean; when: string; start: string; time: string; venue: string; player: string; seat: string | null;
  lines: { tag: string; name: string; qty: number; detail: string; total: string }[];
  sums: { label: string; value: string }[];
  total: string; record: NightRecord | null; by: string;
}

function view(data: InvoiceData, invoiceNo: number, printedByName: string, record: NightRecord | null): View {
  const paid = !!data.paidAt;
  const at = paid ? new Date(data.paidAt as Date) : new Date();
  const sums: View['sums'] = [{ label: 'الطلبات', value: fmt(data.ordersTotal) }];
  if (data.waterCharge > 0) sums.push({ label: 'مياه', value: fmt(data.waterCharge) });
  if (data.minTopup > 0) sums.push({ label: 'تكملة الحدّ الأدنى', value: fmt(data.minTopup) });
  if (data.gameFeeApplied) sums.push({ label: 'دخوليّة اللعبة', value: fmt(data.gameFeeAmount) });
  if (data.loyaltyDiscount > 0) sums.push({ label: `مشروب بطاقة الولاء${data.loyaltyItemName ? ` (${clean(data.loyaltyItemName)})` : ''}`, value: `−${fmt(data.loyaltyDiscount)}` });
  return {
    no: `#${pad(invoiceNo, 4)}`, paid,
    when: dayDate(new Date(data.activityDate)), start: hm(new Date(data.activityDate)), time: hm(at),
    venue: clean(data.locationName) || 'نادي المافيا',
    player: clean(data.playerName) || `لاعب #${data.playerId}`,
    seat: data.seat != null ? pad(data.seat, 2) : null,
    lines: data.lines.map((l, i) => {
      const detail: string[] = [];
      if (l.options.length > 0) detail.push(l.options.map(o => `${esc(clean(o.group))}: ${esc(clean(o.value))}`).join(' · '));
      if (l.components.length > 0) {
        detail.push(l.components.map(c => {
          const co = (c.options ?? []).map(o => esc(clean(o.value))).join('/');
          return `${esc(clean(c.name))}${co ? ` (${co})` : ''} ${n('×' + c.qty * l.quantity)}`;
        }).join(' · '));
      }
      return { tag: pad(i + 1, 2), name: clean(l.name), qty: l.quantity, detail: detail.join('<br>'), total: fmt(l.lineTotal) };
    }),
    sums, total: fmt(data.grandTotal), record, by: clean(printedByName),
  };
}

const TAGLINE = 'الليلة انتهت… والحكاية لم تنتهِ';
const SITE = 'club-mafia.grade.sbs';
const RED = '#9E1B22';

// ══════════════════════════════════════════════════════
// A6 — ملفٌّ ورقيّ (105×148mm؛ 1px = 1/96in كما صُمّم على اللوحة)
// ══════════════════════════════════════════════════════
const A6_CSS = `
@page { size: A6; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { background: #D9C7A1; }
body { font-family: "MC Sans","Noto Sans Arabic",sans-serif; color: #1E1914; direction: rtl; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.n { font-family: "MC Type",monospace; font-variant-numeric: tabular-nums; direction: ltr; unicode-bidi: isolate; }
.rq { font-family: "MC Ruqaa","MC Sans",serif; font-weight: 700; }
.doc { width: 105mm; min-height: 147.5mm; position: relative; padding: 36px 12px 12px; display: flex; break-after: page; overflow: hidden; }
.doc:last-child { break-after: auto; }
.tab { position: absolute; top: 10px; right: 22px; height: 26px; padding: 0 16px; background: #CDB98F; border-radius: 6px 6px 0 0; display: flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 800; }
.tab .n { font-size: 13px; }
.paper { flex: 1; position: relative; background: #F6EFDF; box-shadow: 0 1px 0 #BFAE88, 0 6px 14px rgba(60,40,20,.18); padding: 16px 18px 12px; display: flex; flex-direction: column; }
.clip { position: absolute; top: -14px; left: 168px; }
.hd { display: flex; align-items: center; gap: 9px; }
.hd img { width: 32px; height: 44px; object-fit: contain; }
.hd .t { flex: 1; min-width: 0; }
.hd .t .rq { font-size: 27px; line-height: 1.05; }
.hd .t .s { font-size: 9.5px; font-weight: 800; letter-spacing: .32em; }
.venue { text-align: center; border: 1.5px solid ${RED}; color: ${RED}; padding: 3px 8px 2px; transform: rotate(3deg); max-width: 46%; }
.venue .k { font-size: 9px; font-weight: 800; }
.venue .v { font-size: 14px; font-weight: 900; line-height: 1.15; overflow-wrap: anywhere; }
.facts { margin-top: 10px; font-size: 11.5px; display: flex; flex-direction: column; gap: 4px; }
.fact { display: flex; align-items: flex-end; }
.fact b { font-weight: 800; white-space: nowrap; }
.fact .lead { flex: 1; border-bottom: 1.5px dotted #6B5B45; margin: 0 6px 4px; min-width: 12px; }
.fact .val { text-align: left; }
.sec { display: flex; align-items: center; gap: 7px; margin-top: 11px; }
.sec .rq { font-size: 17px; }
.sec .rule { flex: 1; border-top: 1.5px dashed #6B5B45; }
.sec .u { font-size: 10px; font-weight: 800; }
.line { display: flex; gap: 7px; padding: 5px 0; border-bottom: 1px solid #CFC2A6; font-size: 12px; break-inside: avoid; }
.line .tag { font-family: "MC Type",monospace; font-weight: 700; font-size: 10.5px; border: 1px solid #1E1914; padding: 0 3px; height: 15px; line-height: 15px; direction: ltr; }
.line .nm { flex: 1; min-width: 0; }
.line .nm b { font-weight: 800; }
.line .dt { display: block; font-size: 10.5px; color: #5E5242; }
.line .tt { font-family: "MC Type",monospace; font-weight: 700; direction: ltr; }
.sums { display: flex; flex-direction: column; gap: 2px; margin-top: 7px; font-size: 12px; }
.sum { display: flex; justify-content: space-between; }
.grand { display: flex; justify-content: space-between; align-items: baseline; margin-top: 6px; padding-top: 5px; border-top: 2.5px solid #1E1914; }
.grand .rq { font-size: 19px; }
.grand .n { font-size: 27px; font-weight: 700; }
.grand .u { font-size: 11px; font-weight: 800; }
.grow { flex: 1; min-height: 12px; }
.ft { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; }
.ft .rq { font-size: 14px; }
.ft .meta { font-size: 9.5px; color: #5E5242; }
.stamp { flex: none; transform: rotate(-9deg); border: 3px solid ${RED}; color: ${RED}; border-radius: 8px; padding: 2px; opacity: .92; margin-bottom: 2px; }
.stamp > div { border: 1px solid ${RED}; border-radius: 6px; padding: 3px 10px 4px; text-align: center; }
.stamp .k { font-size: 8px; font-weight: 800; letter-spacing: .24em; direction: ltr; }
.stamp .rq { font-size: 21px; line-height: 1.05; }
.stamp .s { font-size: 9px; font-weight: 800; }
`;

function a6Body(v: View): string {
  const lines = v.lines.map(l => `
    <div class="line"><span class="tag">${l.tag}</span>
      <span class="nm"><b>${esc(l.name)}</b>${l.qty > 1 ? ` ${n('×' + l.qty)}` : ''}${l.detail ? `<span class="dt">${l.detail}</span>` : ''}</span>
      <span class="tt">${l.total}</span></div>`).join('');
  const rec = v.record
    ? `<div class="fact"><b>سجلّه الليلة</b><span class="lead"></span><span class="val">لعب ${n(v.record.games)} · فاز ${n(v.record.wins)}${v.record.lastRole ? ` · آخر دور <b class="rq" style="font-size:13px">${esc(v.record.lastRole)}</b>` : ''}</span></div>`
    : '';
  const stamp = v.paid
    ? `<div class="stamp"><div><div class="k">CASE CLOSED</div><div class="rq">القضيّة مُغلقة</div><div class="s">سُدِّدت ${n(v.time)} · ${esc(v.venue)}</div></div></div>`
    : `<div class="stamp"><div><div class="k">WANTED</div><div class="rq">مطلوب</div><div class="s">يُسدَّد عند الكاشير</div></div></div>`;
  return `<div class="doc">
    <div class="tab">ملفّ ${n(v.no)}</div>
    <div class="paper">
      <svg class="clip" width="20" height="52" viewBox="0 0 20 52" fill="none" stroke="#7D8288" stroke-width="2.2" stroke-linecap="round"><path d="M14 14v26a5 5 0 0 1-10 0V9a4 4 0 0 1 8 0v28a1.6 1.6 0 0 1-3.2 0V14"/></svg>
      <div class="hd">
        <img src="${seal()}" alt="">
        <div class="t"><div class="rq">نادي المافيا</div><div class="s">سرّيّ للغاية</div></div>
        <div class="venue"><div class="k">مسرح الأحداث</div><div class="v">${esc(v.venue)}</div></div>
      </div>
      <div class="facts">
        <div class="fact"><b>المشتبه به</b><span class="lead"></span><span class="val"><b>${esc(v.player)}</b>${v.seat ? ` · مقعد ${n(v.seat)}` : ''}</span></div>
        <div class="fact"><b>الليلة</b><span class="lead"></span><span class="val">${v.when} · ${n(v.start)}</span></div>
        ${rec}
      </div>
      <div class="sec"><span class="rq">المضبوطات</span><span class="rule"></span><span class="u">د.أ</span></div>
      ${lines || '<div class="line"><span class="nm" style="color:#5E5242">لا طلبات</span></div>'}
      <div class="sums">${v.sums.map(s => `<div class="sum"><span>${esc(s.label)}</span>${n(s.value)}</div>`).join('')}</div>
      <div class="grand"><span class="rq">${v.paid ? 'الحساب الأخير' : 'المبلغ المطلوب'}</span><span>${n(v.total)} <span class="u">د.أ</span></span></div>
      <div class="grow"></div>
      <div class="ft">
        <div><div class="rq">${TAGLINE}</div><div class="meta">${n(SITE)}${v.by ? ` · أصدرها ${esc(v.by)}` : ''}</div></div>
        ${stamp}
      </div>
    </div>
  </div>`;
}

const page = (css: string, body: string, extraHead = '') =>
  `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${fonts()}\n${css}</style>${extraHead}</head><body>${body}</body></html>`;

/** فاتورة A6 واحدة — للـPDF */
export function invoiceHtml(data: InvoiceData, invoiceNo: number, printedByName: string, record: NightRecord | null = null): string {
  return page(A6_CSS, a6Body(view(data, invoiceNo, printedByName, record)));
}

/** عدّة فواتير A6 في مستندٍ واحد — كلّ ملفٍّ على ورقته (القالب يفصلها بنفسه) */
export function mergeInvoicePages(pages: string[]): string {
  const bodies = pages.map(p => p.match(/<body>([\s\S]*)<\/body>/)?.[1] ?? '');
  return page(A6_CSS, bodies.join(''));
}

// ══════════════════════════════════════════════════════
// 80مم — إيصال طابعة الكاش. صُمّم على 576 نقطة (72مم بدقّة 203) ويُصغَّر بـzoom
// إلى 72مم مطبوعة؛ أسود على أبيض فقط وبلا مساحات سوداء كبيرة كي لا يبهت.
// ══════════════════════════════════════════════════════
const TH_CSS = `
@page { size: 80mm auto; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { background: #fff; }
body { font-family: "MC Sans","Noto Sans Arabic",sans-serif; color: #111; direction: rtl; }
.n { font-family: "MC Type",monospace; font-variant-numeric: tabular-nums; direction: ltr; unicode-bidi: isolate; }
.rq { font-family: "MC Ruqaa","MC Sans",serif; font-weight: 700; }
.doc { width: 576px; zoom: 0.4724; margin: 0 auto; padding-bottom: 26px; }
.bar { background: #111; color: #fff; text-align: center; padding: 9px 0 8px; font-size: 16px; font-weight: 800; letter-spacing: .32em; }
.in { padding: 0 28px; display: flex; flex-direction: column; }
.brand { display: flex; flex-direction: column; align-items: center; margin-top: 26px; }
.brand img { width: 96px; height: 130px; object-fit: contain; }
.brand .rq { font-size: 66px; line-height: 1.1; margin-top: 6px; }
.brand .en { display: flex; align-items: center; gap: 12px; width: 100%; margin-top: 2px; }
.brand .en i { flex: 1; height: 2px; background: #111; }
.brand .en span { font-size: 15px; font-weight: 800; letter-spacing: .5em; direction: ltr; }
.mini { display: flex; align-items: center; gap: 14px; margin-top: 20px; }
.mini img { width: 50px; height: 68px; object-fit: contain; }
.mini .t { flex: 1; min-width: 0; }
.mini .t .rq { font-size: 40px; line-height: 1.1; }
.mini .t .v { font-size: 17px; font-weight: 800; }
.mini .no { text-align: left; }
.mini .no .k { font-size: 14px; font-weight: 800; }
.mini .no .n { font-size: 28px; font-weight: 700; }
.scene { position: relative; margin-top: 28px; padding: 18px 20px 16px; text-align: center; }
.scene i { position: absolute; width: 26px; height: 26px; border: 0 solid #111; }
.scene .k { font-size: 15px; font-weight: 800; letter-spacing: .2em; }
.scene .v { font-size: 44px; font-weight: 900; line-height: 1.1; margin-top: 4px; overflow-wrap: anywhere; }
.facts { margin-top: 24px; font-size: 20px; display: flex; flex-direction: column; gap: 10px; }
.fact { display: flex; align-items: flex-end; }
.fact b { font-weight: 800; white-space: nowrap; }
.fact .lead { flex: 1; border-bottom: 2px dotted #111; margin: 0 8px 7px; min-width: 16px; }
.fact .big { font-size: 22px; font-weight: 800; }
.fact .n { font-size: 24px; font-weight: 700; }
.rec { margin-top: 22px; border: 3px solid #111; border-radius: 4px; }
.rec .h { background: #111; color: #fff; font-size: 15px; font-weight: 800; letter-spacing: .18em; text-align: center; padding: 5px 0 4px; }
.rec .g { display: grid; grid-template-columns: 1fr 1fr 1.4fr; text-align: center; }
.rec .g > div { padding: 10px 4px; }
.rec .g > div + div { border-right: 2px solid #111; }
.rec .n { font-size: 34px; font-weight: 700; line-height: 1; }
.rec .rq { font-size: 28px; line-height: 1.1; }
.rec .l { font-size: 16px; font-weight: 700; margin-top: 4px; }
.sec { display: flex; align-items: center; gap: 10px; margin-top: 26px; }
.sec .rq { font-size: 32px; }
.sec .rule { flex: 1; border-top: 2px dashed #111; }
.sec .u { font-size: 15px; font-weight: 800; }
.line { display: flex; gap: 12px; padding: 12px 0 10px; border-bottom: 1.5px solid #111; }
.line .tag { flex: none; width: 40px; height: 30px; border: 2px solid #111; display: flex; align-items: center; justify-content: center; font-family: "MC Type",monospace; font-size: 16px; font-weight: 700; }
.line .nm { flex: 1; min-width: 0; }
.line .nm b { font-size: 22px; font-weight: 800; line-height: 1.3; }
.line .nm .q { font-size: 20px; }
.line .dt { font-size: 17px; line-height: 1.45; margin-top: 2px; }
.line .tt { font-family: "MC Type",monospace; font-size: 23px; font-weight: 700; direction: ltr; }
.sums { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; font-size: 20px; }
.sum { display: flex; justify-content: space-between; }
.sum .n { font-weight: 700; }
.grand { margin-top: 14px; border-top: 5px solid #111; border-bottom: 2px solid #111; padding: 12px 0 10px; display: flex; justify-content: space-between; align-items: baseline; }
.grand .rq { font-size: 34px; }
.grand .n { font-size: 54px; font-weight: 700; letter-spacing: -.02em; }
.grand .u { font-size: 20px; font-weight: 800; }
.closed { display: flex; justify-content: center; margin-top: 34px; }
.closed > div { transform: rotate(-7deg); border: 5px solid #111; border-radius: 14px; padding: 5px; }
.closed > div > div { border: 2px solid #111; border-radius: 9px; padding: 8px 26px 10px; text-align: center; }
.closed .k { font-size: 14px; font-weight: 800; letter-spacing: .3em; direction: ltr; }
.closed .rq { font-size: 50px; line-height: 1.1; }
.closed .s { font-size: 17px; font-weight: 700; margin-top: 2px; }
.wanted { margin-top: 20px; border: 5px solid #111; padding: 5px; }
.wanted > div { border: 2px solid #111; padding: 14px 18px 18px; text-align: center; }
.wanted .big { font-size: 104px; line-height: 1; }
.wanted .en { font-size: 16px; font-weight: 800; letter-spacing: .4em; direction: ltr; margin-top: 2px; }
.wanted .who { display: flex; align-items: center; gap: 16px; margin-top: 16px; text-align: right; }
.wanted .ph { flex: none; width: 112px; height: 132px; border: 3px solid #111; display: flex; align-items: center; justify-content: center; position: relative; }
.wanted .ph img { width: 78px; height: 106px; object-fit: contain; }
.wanted .ph .n { position: absolute; bottom: -14px; left: 50%; transform: translateX(-50%); background: #fff; padding: 0 6px; font-size: 18px; font-weight: 700; }
.wanted .k { font-size: 15px; font-weight: 800; }
.wanted .nm { font-size: 30px; font-weight: 900; line-height: 1.2; overflow-wrap: anywhere; }
.wanted .m { font-size: 18px; font-weight: 700; margin-top: 4px; }
.wanted .amt { margin-top: 22px; border-top: 3px solid #111; padding-top: 12px; }
.wanted .amt .n { font-size: 72px; font-weight: 700; letter-spacing: -.03em; line-height: 1.05; }
.wanted .amt .u { font-size: 24px; font-weight: 800; }
.wanted .amt .s { font-size: 19px; font-weight: 800; margin-top: 2px; }
.end { margin-top: 30px; display: flex; align-items: center; gap: 18px; }
.end .rq { font-size: 30px; line-height: 1.35; }
.end .s { font-size: 17px; margin-top: 2px; }
.end .n { font-size: 16px; font-weight: 700; margin-top: 6px; }
.end.c { justify-content: center; text-align: center; }
.cut { margin: 22px 28px 0; border-top: 2px dashed #111; }
@media screen {
  html, body { background: #E9E6E1; }
  .doc { background: #fff; margin: 16px auto; box-shadow: 0 2px 12px rgba(0,0,0,.18); }
  .again { display: block; margin: 12px auto 24px; font: 800 16px "MC Sans",sans-serif; padding: 12px 28px; border-radius: 12px; border: 0; background: #111; color: #fff; }
}
@media print { .again { display: none; } }
`;

const PRINT_SIGIL = `<svg width="74" height="92" viewBox="0 0 74 92" fill="none" stroke="#111" stroke-width="2.4" stroke-linecap="round" style="flex:none">
<ellipse cx="37" cy="48" rx="6" ry="9"/><ellipse cx="37" cy="48" rx="11" ry="15" stroke-dasharray="40 6 22 5"/>
<ellipse cx="37" cy="48" rx="16" ry="21" stroke-dasharray="55 7 30 6"/><ellipse cx="37" cy="48" rx="21" ry="27" stroke-dasharray="70 8 18 6 30 5"/>
<ellipse cx="37" cy="48" rx="26" ry="33" stroke-dasharray="80 9 40 7 26 6"/><ellipse cx="37" cy="48" rx="31" ry="39" stroke-dasharray="60 10 70 8 35 30"/>
<ellipse cx="37" cy="48" rx="35" ry="43" stroke-dasharray="40 26 60 14 50 90"/></svg>`;

function thermalBody(v: View): string {
  const lines = v.lines.map(l => `
    <div class="line"><div class="tag">${l.tag}</div>
      <div class="nm"><b>${esc(l.name)}</b>${l.qty > 1 ? ` <span class="q">${n('×' + l.qty)}</span>` : ''}${l.detail ? `<div class="dt">${l.detail}</div>` : ''}</div>
      <div class="tt">${l.total}</div></div>`).join('');
  const sums = `<div class="sums">${v.sums.map(s => `<div class="sum"><span>${esc(s.label)}</span>${n(s.value)}</div>`).join('')}</div>`;
  const rec = v.record ? `
    <div class="rec"><div class="h">سجلّك الليلة</div><div class="g">
      <div>${n(v.record.games)}<div class="l">${v.record.games === 1 ? 'لعبة' : 'ألعاب'}</div></div>
      <div>${n(v.record.wins)}<div class="l">فوز</div></div>
      <div><div class="rq">${esc(v.record.lastRole || '—')}</div><div class="l">آخر دور لعبته</div></div>
    </div></div>` : '';

  if (v.paid) {
    return `<div class="doc">
      <div class="bar">سرّيّ للغاية · ملفّ ليلة مافيا</div>
      <div class="in">
        <div class="brand"><img src="${seal()}" alt=""><div class="rq">نادي المافيا</div><div class="en"><i></i><span>MAFIA CLUB</span><i></i></div></div>
        <div class="scene">
          <i style="top:0;right:0;border-width:4px 4px 0 0"></i><i style="top:0;left:0;border-width:4px 0 0 4px"></i>
          <i style="bottom:0;right:0;border-width:0 4px 4px 0"></i><i style="bottom:0;left:0;border-width:0 0 4px 4px"></i>
          <div class="k">مسرح الأحداث</div><div class="v">${esc(v.venue)}</div>
        </div>
        <div class="facts">
          <div class="fact"><b>ملفّ رقم</b><span class="lead"></span>${n(v.no)}</div>
          <div class="fact"><b>المشتبه به</b><span class="lead"></span><span class="big">${esc(v.player)}</span></div>
          ${v.seat ? `<div class="fact"><b>المقعد</b><span class="lead"></span>${n(v.seat)}</div>` : ''}
          <div class="fact"><b>الليلة</b><span class="lead"></span><span>${v.when}</span></div>
        </div>
        ${rec}
        <div class="sec"><span class="rq">المضبوطات</span><span class="rule"></span><span class="u">د.أ</span></div>
        ${lines}
        ${sums}
        <div class="grand"><span class="rq">الحساب الأخير</span><span>${n(v.total)} <span class="u">د.أ</span></span></div>
        <div class="closed"><div><div>
          <div class="k">CASE CLOSED</div><div class="rq">القضيّة مُغلقة</div>
          <div class="s">سُدِّدت · ${n(v.time)} · حصّلها ${esc(v.venue)}</div>
        </div></div></div>
        <div class="end">${PRINT_SIGIL}<div style="flex:1;min-width:0">
          <div class="rq">${TAGLINE}</div><div class="s">نراك في الليلة القادمة — لا تثق بأحد</div>${n(SITE)}
        </div></div>
      </div>
      <div class="cut"></div>
    </div>`;
  }

  return `<div class="doc">
    <div class="bar">سرّيّ للغاية · ملفّ ليلة مافيا</div>
    <div class="in">
      <div class="mini"><img src="${seal()}" alt="">
        <div class="t"><div class="rq">نادي المافيا</div><div class="v">${esc(v.venue)}</div></div>
        <div class="no"><div class="k">ملفّ رقم</div>${n(v.no)}</div>
      </div>
      <div class="wanted"><div>
        <div class="rq big">مطلوب</div><div class="en">WANTED</div>
        <div class="who">
          <div class="ph"><img src="${seal()}" alt="">${v.seat ? n('#' + v.seat) : ''}</div>
          <div style="flex:1;min-width:0">
            <div class="k">المشتبه به</div><div class="nm">${esc(v.player)}</div>
            <div class="m">${v.seat ? `المقعد ${n(v.seat)} · ` : ''}${v.when}</div>
            <div class="m" style="font-weight:500">آخر ظهور: ${n(v.time)}</div>
          </div>
        </div>
        <div class="amt"><div class="k" style="font-size:18px">المبلغ المطلوب</div>
          <div>${n(v.total)} <span class="u">د.أ</span></div>
          <div class="s">يُسدَّد عند الكاشير قبل المغادرة</div></div>
      </div></div>
      ${rec}
      <div class="sec"><span class="rq">التهم</span><span class="rule"></span><span class="u">د.أ</span></div>
      ${lines}
      ${sums}
      <div class="end c"><div>
        <div class="rq">الكاشير يعرف من أنت…</div>
        <div class="s" style="font-weight:700">هذه ليست فاتورة نهائيّة — تُغلق القضيّة عند الدفع</div>${n(SITE)}
      </div></div>
    </div>
    <div class="cut"></div>
  </div>`;
}

/**
 * إيصال 80مم — صفحةٌ تطبع نفسها: تنتظر الخطوط ثمّ تفتح نافذة الطباعة.
 * زرّ «اطبع مرّةً أخرى» إن أُغلقت النافذة (يختفي من الورق).
 */
export function receiptHtml(data: InvoiceData, invoiceNo: number, printedByName: string, record: NightRecord | null = null): string {
  const v = view(data, invoiceNo, printedByName, record);
  const auto = `<script>window.addEventListener('load',function(){(document.fonts&&document.fonts.ready||Promise.resolve()).then(function(){setTimeout(function(){window.print()},250)})});</script>`;
  return page(TH_CSS, `${thermalBody(v)}<button class="again" onclick="window.print()">اطبع مرّةً أخرى</button>`, `<title>إيصال ${esc(v.no)}</title>${auto}`);
}
