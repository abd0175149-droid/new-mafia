// ══════════════════════════════════════════════════════
// 🖼️ مصغّرات وجوه الكروت — شرطٌ مسبق لا تحسين
//
// وجهُ الكارت الواحد ~٢ ميغابايت، والمجلَّد ٣٤٫٥ ميغا. في اللعبة يحمّل اللاعب
// **صورةً واحدة** — صورةَ دوره — فالحجم مقصودٌ هناك ولا يُمسّ. أمّا دليلُ الأدوار
// فيعرض الستّةَ عشرَ، فبلا مصغّرٍ يطلب ٣٢ ميغابايت على شبكة قاعة.
//
// 🔴 والأصلُ لا يُمَسّ أبداً: المصغّرُ ملفٌّ مجاور. كشفُ الدور لحظةَ قلب البطاقة
//    يبقى بالجودة الكاملة — وهي أكثرُ لحظةٍ يراها اللاعب في الليلة كلِّها.
//
// 🔴 وفشلُ التوليد لا يُفشل شيئاً: يعود المسارُ الأصليّ فيُعرض الكارت ثقيلاً
//    ولا تنكسر شاشة. الأداءُ يُضحّى به قبل الوظيفة.
// ══════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';

/** عرضُ المصغّر الكبير — كارتٌ بملء شاشة الهاتف عند كثافةٍ عالية. */
const W_FULL = 720;
/** عرضُ المصغّر الصغير — صفوفٌ ورقائقُ وقوائم. */
const W_SM = 256;

export const CARD_FACES_DIR = path.resolve('uploads/card-faces');
export const THUMBS_DIR = path.join(CARD_FACES_DIR, 'thumbs');

/** اسمُ ملفّ المصغّر لأصلٍ معلوم — بلا امتداد الأصل كي لا يلتبس jpg بـpng. */
function thumbNames(originalFile: string): { full: string; sm: string } {
  const base = originalFile.replace(/\.[^.]+$/, '');
  return { full: `${base}.webp`, sm: `${base}_sm.webp` };
}

/** يستخرج اسمَ الملفّ من مسارٍ مثل `/uploads/card-faces/x.jpg`. */
export function fileNameFromUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  if (/^https?:\/\//i.test(url)) return null;               // مستضافٌ خارجاً — لا نلمسه
  const m = url.match(/\/uploads\/card-faces\/([^/?#]+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * يولّد المصغّرين لملفٍّ واحد إن غابا. آمنٌ للتكرار.
 * يُرجِع true إن صار المصغّران موجودين.
 */
export async function ensureThumbs(originalFile: string): Promise<boolean> {
  try {
    const src = path.join(CARD_FACES_DIR, originalFile);
    if (!fs.existsSync(src)) return false;
    if (!fs.existsSync(THUMBS_DIR)) fs.mkdirSync(THUMBS_DIR, { recursive: true });

    const { full, sm } = thumbNames(originalFile);
    const fullPath = path.join(THUMBS_DIR, full);
    const smPath = path.join(THUMBS_DIR, sm);
    if (fs.existsSync(fullPath) && fs.existsSync(smPath)) return true;

    const sharp = (await import('sharp')).default;
    if (!fs.existsSync(fullPath)) {
      await sharp(src).resize({ width: W_FULL, withoutEnlargement: true })
        .webp({ quality: 82 }).toFile(fullPath);
    }
    if (!fs.existsSync(smPath)) {
      await sharp(src).resize({ width: W_SM, withoutEnlargement: true })
        .webp({ quality: 78 }).toFile(smPath);
    }
    return true;
  } catch (e: any) {
    console.warn(`⚠️ [card-thumbs] تعذّر توليد مصغّر ${originalFile}: ${e.message}`);
    return false;
  }
}

/**
 * مسارات العرض لوجهٍ معلوم. المصغّرُ يُذكر **فقط إن كان موجوداً على القرص** —
 * فرابطٌ لملفٍّ غير مولَّد يعني كارتاً فارغاً على شاشة لاعب.
 */
export function thumbUrls(customImageUrl: string | null | undefined): {
  thumbUrl?: string; thumbSmUrl?: string;
} {
  const file = fileNameFromUrl(customImageUrl);
  if (!file) return {};
  const { full, sm } = thumbNames(file);
  const out: { thumbUrl?: string; thumbSmUrl?: string } = {};
  try {
    if (fs.existsSync(path.join(THUMBS_DIR, full))) out.thumbUrl = `/uploads/card-faces/thumbs/${full}`;
    if (fs.existsSync(path.join(THUMBS_DIR, sm))) out.thumbSmUrl = `/uploads/card-faces/thumbs/${sm}`;
  } catch { /* قرصٌ لا يُقرأ — نعود بالأصل */ }
  return out;
}

/** يولّد ما ينقص لكلّ وجهٍ في المجلَّد. يُستدعى من سكربت الملء ومن الإقلاع. */
export async function backfillAllThumbs(): Promise<{ done: number; failed: number }> {
  let done = 0, failed = 0;
  try {
    if (!fs.existsSync(CARD_FACES_DIR)) return { done, failed };
    const files = fs.readdirSync(CARD_FACES_DIR)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
    for (const f of files) {
      if (await ensureThumbs(f)) done++; else failed++;
    }
  } catch (e: any) {
    console.warn(`⚠️ [card-thumbs] فشل الملء: ${e.message}`);
  }
  return { done, failed };
}
