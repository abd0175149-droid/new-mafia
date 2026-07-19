// ══════════════════════════════════════════════════════
// 🖼️ توليد مصغّرات WebP 192px لكل الأفاتارات القائمة (backfill مرّة واحدة)
// التشغيل: npx tsx src/scripts/generate-avatar-thumbs.ts
// ══════════════════════════════════════════════════════

import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

async function main() {
  const dir = path.resolve('uploads/avatars');
  const thumbsDir = path.join(dir, 'thumbs');
  if (!fs.existsSync(dir)) { console.log('لا مجلد أفاتارات — لا شيء ليُولَّد'); return; }
  if (!fs.existsSync(thumbsDir)) fs.mkdirSync(thumbsDir, { recursive: true });

  const files = fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f));
  let ok = 0, skipped = 0, failed = 0;
  for (const f of files) {
    const base = f.replace(/\.[^.]+$/, '');
    const out = path.join(thumbsDir, `${base}.webp`);
    // لا نعيد توليد مصغّرٍ أحدث من مصدره
    if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(path.join(dir, f)).mtimeMs) { skipped++; continue; }
    try {
      await sharp(path.join(dir, f)).resize(192, 192, { fit: 'cover' }).webp({ quality: 80 }).toFile(out);
      ok++;
    } catch (e: any) {
      failed++;
      console.warn(`⚠️ ${f}: ${e.message}`);
    }
  }
  console.log(`✅ مصغّرات: ${ok} جديدة، ${skipped} موجودة، ${failed} فشلت (من ${files.length})`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
