// 📐 فحصٌ سريع لشبكة الكروت المحسوبة على قياساتٍ شائعة — npx tsx scripts/grid-sanity.ts
import { computeCardGrid, balancedRows } from '../src/components/display/viewport';

const screens = [[1920, 1080], [1366, 768], [3840, 2160], [1280, 720]];
const counts = [4, 8, 12, 16, 20, 24, 27, 29, 32];
let bad = 0;
for (const [w, h] of screens) {
  const availW = w - 64, availH = h - 48 - 40 - 16 - 150 - 16;   // اللوبي: هوامش + رأس + شريط QR
  console.log(`\n── ${w}×${h} (avail ${availW}×${availH}) ──`);
  for (const n of counts) {
    const g = computeCardGrid(n, availW, availH, { gap: 18, maxK: 1.8 });
    const usedW = g.cols * g.cardW + (g.cols - 1) * g.gap, usedH = g.rows * g.cardH + (g.rows - 1) * g.gap;
    const fits = usedW <= availW + 0.5 && usedH <= availH + 0.5;
    const fill = Math.round(100 * (usedW * usedH) / (availW * availH));
    const orphan = g.rowCounts.length > 1 && g.rowCounts[g.rowCounts.length - 1] < g.rowCounts[0] - 1;
    if (!fits || orphan) bad++;
    console.log(`n=${String(n).padStart(2)}  ${g.cols}×${g.rows}  card ${Math.round(g.cardW)}×${Math.round(g.cardH)} (k=${g.k.toFixed(2)})  rows=[${g.rowCounts.join(',')}]  fill=${fill}%  ${fits ? '✅' : '❌ overflow'}${orphan ? ' ❌ orphan' : ''}`);
  }
}
console.log(balancedRows(29, 4), balancedRows(7, 3));
if (bad) { console.log(`\n❌ ${bad} مشكلات`); process.exit(1); } else console.log('\n✅ كلّ الشبكات داخل المنطقة وبلا صفٍّ يتيم');
