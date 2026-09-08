import { chromium } from 'playwright';
import fs from 'fs';
const src = 'C:/Users/abdul/AppData/Local/Temp/claude/c--Projects-new-mafia/3057e8a1-c34a-4eed-9a78-7b5a70f0bf6b/scratchpad/mafia-pitch.html';
fs.writeFileSync('_pt.html','<!doctype html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}img{max-width:100%}</style></head><body>'+fs.readFileSync(src,'utf8')+'</body>');
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1280,height:1050} });
const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,200)));
await p.goto('file://'+process.cwd().split(String.fromCharCode(92)).join('/')+'/_pt.html',{waitUntil:'networkidle'});
await p.waitForTimeout(2000);
console.log('أخطاء:', errs.length?errs:'لا شيء ✅');
console.log(await p.evaluate(()=>({
  pillars:document.querySelectorAll('#pils .pil').length,
  scenes:document.querySelectorAll('#scenes .sc').length,
  cuts:document.querySelectorAll('#cutlist .cut').length,
  no:document.querySelectorAll('#nolist .nono').length,
  audits:document.querySelectorAll('#audits .bug').length,
  shots:document.querySelectorAll('#shots li').length,
  qs:document.querySelectorAll('#qs .q-card').length,
  hscroll:document.documentElement.scrollWidth>document.documentElement.clientWidth,
})));
await p.evaluate(()=>document.getElementById('script').scrollIntoView());
await p.waitForTimeout(600);
await p.screenshot({path:'_pt1.png'});
await b.close();
