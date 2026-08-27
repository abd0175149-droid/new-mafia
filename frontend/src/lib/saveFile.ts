// ══════════════════════════════════════════════════════
// 💾 حفظُ ملفٍّ على الجهاز — بمسارٍ يعمل على iOS أيضاً
//
// النمطُ القديم `<a download href="data:…">` **لا يحفظ شيئاً على iOS**، وأربعةُ
// أسبابٍ تتضافر عليه:
//   ١. WebKit يمنع الانتقال إلى روابط `data:` منعاً باتّاً منذ iOS 9 — فالضغطةُ
//      على وصلةٍ تحملها لا تفعل شيئاً إطلاقاً: لا تنزيلاً ولا خطأً.
//   ٢. التطبيقُ المثبَّت (`display: standalone`) بلا مدير تنزيلاتٍ أصلاً، فلا
//      مكانَ يظهر فيه ملفٌّ نازل.
//   ٣. خاصّيّةُ `download` استرشاديّةٌ على iOS ولا تمتدّ إلى الوضع المثبَّت.
//   ٤. و`toDataURL` لصورةٍ كبيرة يُنتج نصَّ base64 بعشرات الميغابايت.
//
// 🔴 والأخطرُ أنّ `a.click()` **لا يرمي حين لا يفعل شيئاً**: فالـtry يكتمل
//    والـcatch لا يعمل، فيبدو الفشلُ نجاحاً. لذلك تُرجِع هذه الدالّة **نتيجةً
//    صريحة** يفحصها المستدعي بدل أن يفترض.
//
// 🔴 والمسارُ الصحيح على iOS هو ورقةُ المشاركة بملفّ: سفاري ١٥+ يدعمها، وفيها
//    «حفظ الصورة» و«حفظ في الملفّات» — وتعمل داخل التطبيق المثبَّت.
//    وتشترط إيماءةَ مستخدمٍ حيّة، وتوليدُ الصورة يستغرق وقتاً قد يُبطلها —
//    فإن رُفضت لهذا السبب نعرض الصورةَ في طبقةٍ فيها زرُّ مشاركةٍ بإيماءةٍ جديدة.
// ══════════════════════════════════════════════════════

export type SaveResult =
  | 'shared'      // مرّت عبر ورقة المشاركة
  | 'downloaded'  // نزلت كملفّ
  | 'preview'     // عُرضت ليحفظها المستخدم بيده (ضغطٌ مطوّل)
  | 'cancelled'   // أغلق المستخدمُ ورقةَ المشاركة
  | 'failed';

export const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ يتنكّر في هيئة ماك — واللمسُ يفضحه
    (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1));

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (((window.navigator as any).standalone === true) ||
    window.matchMedia?.('(display-mode: standalone)').matches === true);

/** هل يستطيع هذا المتصفّح مشاركةَ ملفّ؟ */
export function canShareFile(file: File): boolean {
  try {
    return typeof navigator !== 'undefined' &&
      typeof (navigator as any).share === 'function' &&
      typeof (navigator as any).canShare === 'function' &&
      (navigator as any).canShare({ files: [file] });
  } catch { return false; }
}

async function shareFile(file: File, title?: string): Promise<SaveResult> {
  try {
    await (navigator as any).share({ files: [file], title: title || file.name });
    return 'shared';
  } catch (e: any) {
    // 🔴 إلغاءُ المستخدم ليس فشلاً — ولا يُعرض له خطأ
    if (e?.name === 'AbortError') return 'cancelled';
    // NotAllowedError: انقضت الإيماءةُ أثناء توليد الملفّ
    return 'failed';
  }
}

function downloadBlob(blob: Blob, filename: string): SaveResult {
  try {
    // 🔴 blob: لا data: — الثاني ممنوعٌ على iOS ومحدودُ الطول في غيره
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return 'downloaded';
  } catch { return 'failed'; }
}

/**
 * طبقةُ الحفظ اليدويّ — الملاذُ الذي لا يفشل على iOS.
 * الضغطُ المطوّل على `<img>` سلوكٌ أصليٌّ في iOS يحفظ الصورة بلا إذنٍ ولا واجهة.
 */
function showPreviewOverlay(blob: Blob, filename: string, isImage: boolean): SaveResult {
  try {
    const url = URL.createObjectURL(blob);
    const wrap = document.createElement('div');
    wrap.dir = 'rtl';
    Object.assign(wrap.style, {
      position: 'fixed', inset: '0', zIndex: '2147483000',
      background: 'rgba(6,5,4,0.97)', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '14px', gap: '12px',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    } as CSSStyleDeclaration);

    const close = () => { wrap.remove(); setTimeout(() => URL.revokeObjectURL(url), 5_000); };

    const hint = document.createElement('p');
    hint.textContent = isImage
      ? 'اضغطْ مطوّلاً على الصورة ثمّ اختر «حفظ الصورة»'
      : 'اضغطْ «مشاركة» ثمّ «حفظ في الملفّات»';
    Object.assign(hint.style, {
      color: '#c9a457', fontSize: '13.5px', fontWeight: '700', margin: '0', textAlign: 'center',
    } as CSSStyleDeclaration);

    let media: HTMLElement;
    if (isImage) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = filename;
      Object.assign(img.style, {
        maxWidth: '100%', maxHeight: '72vh', objectFit: 'contain',
        borderRadius: '10px', border: '1px solid #2b2621',
        // 🔴 ضروريّان: بلاهما يمنع WebKit قائمةَ «حفظ الصورة» عند الضغط المطوّل
        WebkitTouchCallout: 'default', WebkitUserSelect: 'auto',
      } as any);
      media = img;
    } else {
      const box = document.createElement('div');
      box.textContent = `📄 ${filename}`;
      Object.assign(box.style, {
        color: '#efe9dc', fontSize: '14px', padding: '26px 20px',
        border: '1px dashed #2b2621', borderRadius: '12px', textAlign: 'center',
      } as CSSStyleDeclaration);
      media = box;
    }

    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' } as CSSStyleDeclaration);

    const mkBtn = (label: string, primary: boolean) => {
      const b = document.createElement('button');
      b.textContent = label;
      Object.assign(b.style, {
        fontFamily: 'inherit', fontSize: '13px', fontWeight: '800', cursor: 'pointer',
        borderRadius: '11px', padding: '10px 18px', border: '1px solid #2b2621',
        background: primary ? '#c9a457' : '#151310', color: primary ? '#0a0805' : '#c9a457',
      } as CSSStyleDeclaration);
      return b;
    };

    // 🔴 زرُّ مشاركةٍ بإيماءةٍ **جديدة**: إن رُفضت المشاركةُ أوّلاً لانقضاء إيماءة
    //    التوليد، فهذه ضغطةٌ حيّةٌ تنجح.
    const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
    if (canShareFile(file)) {
      const sh = mkBtn('📤 مشاركة / حفظ', true);
      sh.onclick = async () => { const r = await shareFile(file); if (r === 'shared') close(); };
      row.appendChild(sh);
    }
    const dl = mkBtn('⬇️ تنزيل', false);
    dl.onclick = () => downloadBlob(blob, filename);
    row.appendChild(dl);

    const x = mkBtn('إغلاق', false);
    x.onclick = close;
    row.appendChild(x);

    wrap.append(hint, media, row);
    // الضغطُ على الخلفيّة يُغلق — لا على الصورة نفسِها
    wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
    document.body.appendChild(wrap);
    return 'preview';
  } catch { return 'failed'; }
}

/**
 * يحفظ ملفّاً بأفضل مسارٍ يدعمه الجهاز.
 *
 * الترتيب: ورقةُ المشاركة (تحوي «حفظ الصورة» على iOS) ← تنزيلٌ مباشر ←
 * طبقةُ حفظٍ يدويّ. ويُرجِع ما جرى فعلاً كي لا يُقال «تمّ» بلا دليل.
 */
export async function saveFile(
  blob: Blob,
  filename: string,
  opts?: { title?: string; forceShareFirst?: boolean },
): Promise<SaveResult> {
  const type = blob.type || '';
  const isImage = type.startsWith('image/');
  const file = new File([blob], filename, { type: type || 'application/octet-stream' });

  // 🔴 المشاركةُ أوّلاً على iOS دائماً: التنزيلُ هناك لا يحفظ شيئاً، وتجربتُه
  //    أوّلاً تُنتج «نجاحاً» كاذباً كالذي كان.
  const shareFirst = opts?.forceShareFirst ?? (isIOS() || isStandalone());
  if (shareFirst && canShareFile(file)) {
    const r = await shareFile(file, opts?.title);
    if (r === 'shared' || r === 'cancelled') return r;
    // فشلت (انقضت الإيماءةُ غالباً) ⇒ طبقةٌ فيها زرٌّ بإيماءةٍ جديدة
    return showPreviewOverlay(blob, filename, isImage);
  }

  // سطحُ المكتب وأندرويد: التنزيلُ المباشر يعمل ويُبقي التجربةَ كما اعتادها
  if (!isIOS()) {
    const r = downloadBlob(blob, filename);
    if (r === 'downloaded') return r;
  }

  if (canShareFile(file)) {
    const r = await shareFile(file, opts?.title);
    if (r === 'shared' || r === 'cancelled') return r;
  }
  return showPreviewOverlay(blob, filename, isImage);
}

/** يحوّل canvas إلى Blob — أخفُّ من toDataURL بمراحل ولا يمرّ بنصِّ base64. */
export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))), type, quality);
    } catch (e) { reject(e as Error); }
  });
}
