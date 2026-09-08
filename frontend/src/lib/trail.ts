// ══════════════════════════════════════════════════════
// 🧭 مسارُ مواقعِ لاعب — منطقُ العرض المشترك
//
// 🔴 وحدةٌ واحدةٌ لشاشتين: خريطةُ مواقع اللاعبين وتبويبُ الموقع في ملفّ
//    اللاعب. نسختان تعنيان تدرّجاً لونيّاً يختلف بين شاشتين تعرضان
//    الشيءَ نفسَه، فيظنّ القارئُ أنّ البيانَ اختلف.
// ══════════════════════════════════════════════════════

// 🎨 تدرّجٌ زمنيّ: الغامقُ للأحدث والفاتحُ للأقدم.
// 🔴 لكنّ بلاطاتِ الخريطة فاتحة، فتدرّجٌ ينتهي إلى الأبيض يُخفي القديمَ لا
//    يُخفته. فالمدى يقف عند نعناعيٍّ شاحبٍ ما زال يُرى، ويُسنَد بقناةٍ ثانية:
//    القطرُ يصغر مع القِدَم. لونان يقولان الشيء نفسه أوضحُ من لونٍ وحده.
export const TRAIL_NEW = [4, 47, 46];      // #042f2e — زمرّديٌّ عميق
export const TRAIL_OLD = [153, 246, 228];  // #99f6e4 — نعناعيٌّ شاحب

/** لونُ نقطةٍ حسب موقعها الزمنيّ: ٠ للأحدث و١ للأقدم */
export function trailColor(t: number): string {
  const c = TRAIL_NEW.map((n, i) => Math.round(n + (TRAIL_OLD[i] - n) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** قطرُ النقطة: ١٨ بكسلاً للأحدث ← ١٠ للأقدم */
export function trailSize(t: number): number {
  return Math.round(18 - t * 8);
}

/** مسافةُ هافرساين بالأمتار */
export function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * «قبل ٥ ث» — عمرُ النقطة بالكلمات لا بالطابع الزمنيّ.
 *
 * 🔴 الثواني ليست إفراطاً: خريطةُ اللاعبين تُقرأ أثناء ليلةٍ جارية، و«قبل
 *    دقيقة» هناك تعني «الآن» و«قبل صفر دقيقة» تعني عطلاً. فالسلّمُ واحدٌ
 *    للشاشتين: التاريخُ لا يتضرّر من دقّةٍ زائدة، والحيُّ يتضرّر من نقصها.
 */
export function ago(ts: number, now = Date.now()): string {
  const sec = Math.max(0, Math.round((now - ts) / 1000));
  if (sec < 60) return `قبل ${sec} ث`;
  if (sec < 3600) return `قبل ${Math.round(sec / 60)} د`;
  if (sec < 86400) return `قبل ${Math.round(sec / 3600)} س`;
  const d = Math.round(sec / 86400);
  return d < 60 ? `قبل ${d} يوم` : `قبل ${Math.round(d / 30)} شهر`;
}

/** «ساعتان و١٥ د» — مدّةُ مكوثٍ لا عمرُ نقطة */
export function dur(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 1) return 'أقلَّ من دقيقة';
  if (m < 60) return `${m} دقيقة`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} س و${r} د` : `${h} ساعة`;
}

/** «٦ م» أو «١٫٢ كم» — و«—» حين لا مسافةَ أصلاً */
export function dist(m: number | null): string {
  if (m === null || m === undefined) return '—';
  return m < 1000 ? `${Math.round(m)} م` : `${(m / 1000).toFixed(1)} كم`;
}

export interface Fix {
  lat: number; lng: number; at: number;
  accuracyM: number | null; isMocked: boolean; source: string | null;
}
export interface Venue {
  id: number; name: string; lat: number; lng: number; radiusM: number | null;
}

/** أقربُ مكانٍ إلى نقطة — ومسافتُه */
export function nearestVenue(f: Fix, venues: Venue[]) {
  let best: { v: Venue; d: number } | null = null;
  for (const v of venues) {
    const d = haversineM(f.lat, f.lng, v.lat, v.lng);
    if (!best || d < best.d) best = { v, d };
  }
  return best;
}

/**
 * يجمع النقاطَ المتتاليةَ في **مكوث**: نقاطٌ متقاربةٌ مكاناً ومتتابعةٌ زمناً.
 *
 * 🔴 التطبيقُ يبلّغ كلَّ بضع دقائق، فلاعبٌ جلس ثلاثَ ساعاتٍ في مكانٍ واحدٍ
 *    يُنتج أربعين نقطةً فوق بعضها — تُقرأ أربعين زيارةً وهي زيارةٌ واحدة.
 *    والتجميعُ يحوّل «٤٠ نقطة» إلى «مكث ٣ ساعاتٍ في مزاج افندينا».
 */
export function groupStays(fixes: Fix[], venues: Venue[], radiusM = 150, gapMs = 45 * 60000) {
  // fixes تصل الأحدثَ أوّلاً — نعكسها لنبنيَ زمنيّاً ثمّ نعيد العكس
  const asc = [...fixes].sort((a, b) => a.at - b.at);
  const out: {
    from: number; to: number; n: number; lat: number; lng: number;
    venue: string | null; distM: number | null; mocked: boolean; worstAccuracy: number | null;
  }[] = [];

  for (const f of asc) {
    const last = out[out.length - 1];
    const near = last && haversineM(f.lat, f.lng, last.lat, last.lng) <= radiusM;
    const soon = last && (f.at - last.to) <= gapMs;
    if (last && near && soon) {
      last.to = f.at; last.n++;
      last.mocked = last.mocked || f.isMocked;
      if (f.accuracyM != null) {
        last.worstAccuracy = last.worstAccuracy == null ? f.accuracyM : Math.max(last.worstAccuracy, f.accuracyM);
      }
      continue;
    }
    const nv = nearestVenue(f, venues);
    out.push({
      from: f.at, to: f.at, n: 1, lat: f.lat, lng: f.lng,
      // اسمُ المكان إن كان داخلَ سياجه أو ضمن ٣٠٠ م — وإلّا فلا اسمَ يُخترع
      venue: nv && nv.d <= Math.max(nv.v.radiusM ?? 0, 300) ? nv.v.name : null,
      distM: nv ? Math.round(nv.d) : null,
      mocked: f.isMocked,
      worstAccuracy: f.accuracyM,
    });
  }
  return out.reverse();   // الأحدثُ أوّلاً للعرض
}
