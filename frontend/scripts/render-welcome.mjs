// ══════════════════════════════════════════════════════
// 🎬 تصيير مقطع شاشة الترحيب من محرّك شاشة القاعة (مصدرٌ واحد للحقيقة)
//    يفتح /display/preview في متصفّح بلا شاشة، يستدعي window.__street.captureSequence('WALK'…)
//    ويحفظ الإطارات JPEG ثمّ يكوّدها Blender (ffmpeg مدمج) إلى H.264 عموديّ 720×1280 + ملصق.
//    التشغيل: BASE=http://localhost:3111 node scripts/render-welcome.mjs   (يحتاج خادم dev أو الإنتاج)
// ══════════════════════════════════════════════════════
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('../../e2e-sound/node_modules/playwright');
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE || 'http://localhost:3111';
const FPS = 30, SECONDS = 9, W = 720, H = 1280;
const OUT = path.resolve('public/video'); const FRAMES = path.resolve('.welcome-frames');
fs.mkdirSync(OUT, { recursive: true }); fs.rmSync(FRAMES, { recursive: true, force: true }); fs.mkdirSync(FRAMES);

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('console', m => { const t = m.text(); if (/🔥|Error|error/.test(t)) console.log(m.type().toUpperCase(), t.slice(0, 200)); });
await page.goto(`${BASE}/display/preview?scene=night&q=high&dbg=0`, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => window.__street && window.__street.prewarmDone, null, { timeout: 600000 }).catch(() => console.log('prewarm wait timed out — continuing'));
await page.exposeFunction('__saveFrame', async (dataUrl, i) => { fs.writeFileSync(path.join(FRAMES, `f${String(i).padStart(4, '0')}.jpg`), Buffer.from(dataUrl.split(',')[1], 'base64')); if (i % 30 === 0) console.log('frame', i); });
await page.evaluate(async ({ fps, seconds, w, h }) => { await window.__street.captureSequence('WALK', seconds, fps, w, h, (d, i) => window.__saveFrame(d, i), 'night'); }, { fps: FPS, seconds: SECONDS, w: W, h: H });
await browser.close();
const n = fs.readdirSync(FRAMES).length; console.log('frames saved:', n);
// (الملصق يُنسخ بعد نجاح التكويد — لا قبله — كي لا يُشحن ملصقٌ جديد مع مقطعٍ قديم إن سقط Blender)

// Blender: image sequence → H.264 MP4
const BL = process.env.BLENDER || 'C:/Program Files/Blender Foundation/Blender 4.4/blender.exe';
const py = path.join(FRAMES, 'encode.py');
fs.writeFileSync(py, `
import bpy, os
frames = r"${FRAMES.replace(/\\/g, '/')}"
files = sorted(f for f in os.listdir(frames) if f.endswith('.jpg'))
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene; sc.render.resolution_x = ${W}; sc.render.resolution_y = ${H}; sc.render.resolution_percentage = 100; sc.render.fps = ${FPS}
sc.frame_start = 1; sc.frame_end = len(files)
se = sc.sequence_editor_create()
strip = se.sequences.new_image(name='walk', filepath=os.path.join(frames, files[0]), channel=1, frame_start=1)
for f in files[1:]: strip.elements.append(f)
sc.render.image_settings.file_format = 'FFMPEG'; sc.render.ffmpeg.format = 'MPEG4'; sc.render.ffmpeg.codec = 'H264'; sc.render.ffmpeg.constant_rate_factor = 'MEDIUM'; sc.render.ffmpeg.ffmpeg_preset = 'GOOD'; sc.render.ffmpeg.gopsize = 15
sc.render.filepath = r"${OUT.replace(/\\/g, '/')}/club-entry.mp4"
bpy.ops.render.render(animation=True)
print('ENCODED')
`);
const out = execFileSync(BL, ['-b', '--python-exit-code', '1', '--python', py], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); // استثناءُ بايثون يُسقط التشغيل
if (!out.includes('ENCODED')) { console.error('Blender encode failed:\n' + out.slice(-800)); process.exit(1); }
console.log('encoded → public/video/club-entry.mp4');
const mp4 = fs.readdirSync(OUT).find(f => f.startsWith('club-entry') && f.endsWith('.mp4'));
if (mp4 && mp4 !== 'club-entry.mp4') fs.renameSync(path.join(OUT, mp4), path.join(OUT, 'club-entry.mp4'));
fs.copyFileSync(path.join(FRAMES, 'f0000.jpg'), path.join(OUT, 'club-entry.jpg'));
console.log('size:', (fs.statSync(path.join(OUT, 'club-entry.mp4')).size / 1e6).toFixed(2), 'MB');
// 📱 نسخةُ فلتر تُحزم داخل الـAPK/IPA (welcome_scene.dart · pubspec assets): تُنسخ هنا كي لا تتباعد النسختان —
//    ولا تصل المستخدمين إلّا برفع version في mobile/pubspec.yaml وإعادة بناء التطبيق ونشره.
const MOBILE = path.resolve('../mobile/assets/video/club-entry.mp4');
if (fs.existsSync(path.dirname(MOBILE))) { fs.copyFileSync(path.join(OUT, 'club-entry.mp4'), MOBILE); console.log('copied → mobile/assets/video/club-entry.mp4 — ارفع version في mobile/pubspec.yaml وأعد بناء التطبيق'); }
// 🌐 الويب: ارفع VIDEO_V في src/components/WelcomeScene.tsx كي لا يعلق المقطع القديم في كاش المتصفّح
console.log('ثمّ ارفع VIDEO_V في src/components/WelcomeScene.tsx');
