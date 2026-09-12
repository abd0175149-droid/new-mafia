// ══════════════════════════════════════════════════════
// 📐 شاشة العرض داخل الشاشة — لا تمرير ولا عنصرٌ خارج الإطار، بثلاثة قياسات
// تشغيل: node display-fit.test.mjs [url]   (الافتراضيّ: الإنتاج)
// ══════════════════════════════════════════════════════
// ما يُفحص الآن: الشاشة الأولى (اختيار النشاط) لأنّ ما بعدها يحتاج غرفةً حيّة؛
// الفحص العامّ نفسه (scrollHeight ≤ innerHeight ولا مستطيل يخرج عن الإطار) هو
// ما يجب أن يمرّ على كلّ مرحلة — استعمله على أيّ شاشةٍ مفتوحة عبر ?url=
import { chromium } from 'playwright';

const url = process.argv[2] || 'https://club-mafia.grade.sbs/display';
const sizes = [[1920, 1080], [1366, 768], [3840, 2160]];
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
let failed = 0;
for (const [w, h] of sizes) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => {
    const de = document.documentElement;
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el); if (cs.position === 'fixed' || cs.visibility === 'hidden' || cs.display === 'none') continue;
      const rc = el.getBoundingClientRect(); if (rc.width < 4 || rc.height < 4) continue;
      if (rc.bottom > innerHeight + 1 || rc.right > innerWidth + 1 || rc.top < -1 || rc.left < -1) out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} → ${Math.round(rc.left)},${Math.round(rc.top)} ${Math.round(rc.width)}×${Math.round(rc.height)}`);
    }
    return { scroll: de.scrollHeight > innerHeight + 1 || de.scrollWidth > innerWidth + 1, sh: de.scrollHeight, sw: de.scrollWidth, out: out.slice(0, 6) };
  });
  const ok = !r.scroll && r.out.length === 0;
  if (!ok) failed++;
  console.log(`${ok ? '✅' : '❌'} ${w}×${h}  scroll=${r.scroll} (${r.sw}×${r.sh})${r.out.length ? '\n   خارج الإطار: ' + r.out.join(' | ') : ''}`);
  await p.close();
}
await b.close();
process.exit(failed ? 1 : 0);
