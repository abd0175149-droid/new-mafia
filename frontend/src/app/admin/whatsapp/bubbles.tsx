'use client';

import { useEffect, useState, useRef } from 'react';
import { Play, Mic, Video, FileText, Smartphone, Cloud } from 'lucide-react';
import { swalToast } from '@/lib/swal';
import { apiFetch, getToken, API_URL } from './wa-lib';

// ══════════════════════════════════════════════════════
// 🎧 فقاعة الرسالة الصوتيّة — تشغيلٌ من اللوحة + تفريغٌ نصّيّ
// ══════════════════════════════════════════════════════
// الصوت لا يُجلب برابطٍ مباشر: Cloud API يطلب توكننا، و<audio src> لا يحمل ترويسة
// Authorization. فنجلبه blob عبر apiFetch ثمّ نصنع رابط كائن محلّيّاً.
export function AudioBubble({ m }: { m: any }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [txt, setTxt] = useState<string | null>(m.payload?.transcript || null);
  const [showTxt, setShowTxt] = useState(false);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const load = async () => {
    if (url || busy) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`${API_URL}/api/whatsapp/messages/${m.id}/media`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `تعذّر الجلب (${res.status})`);
      }
      setUrl(URL.createObjectURL(await res.blob()));
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const transcribe = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await apiFetch(`/api/whatsapp/messages/${m.id}/transcribe`, { method: 'POST' });
      setTxt(r.transcript || '[غير واضح]');
      setShowTxt(true);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  // التفريغ يُخزَّن في نصّ الرسالة مسبوقاً بـ🎤 — فإن كان موجوداً فهو الجسد نفسه
  const bodyTranscript = typeof m.body === 'string' && m.body.startsWith('🎤 ') && m.body !== '🎤 رسالة صوتية'
    ? m.body.slice(2).trim() : null;
  const transcript = txt || bodyTranscript;

  return (
    <div style={{ minWidth: 220 }}>
      {url ? (
        <audio src={url} controls autoPlay style={{ width: '100%', height: 40 }} />
      ) : (
        <div className="voice">
          <button type="button" className="play" onClick={load} disabled={busy} aria-label="تشغيل الرسالة الصوتيّة"><Play /></button>
          <span className="grow" style={{ font: '500 13px/18px var(--font-sans)' }}>{busy ? 'جارٍ التحميل…' : 'رسالة صوتيّة'}</span>
          <Mic className="s" />
        </div>
      )}
      {transcript ? (
        <button type="button" className="wa-more" style={{ marginTop: 6, minHeight: 32 }} onClick={() => setShowTxt(v => !v)}>
          {showTxt ? 'إخفاء التفريغ' : 'عرض التفريغ'}
        </button>
      ) : (
        <button type="button" className="wa-more" style={{ marginTop: 6, minHeight: 32 }} onClick={transcribe} disabled={busy}>
          {busy ? '…' : 'فرّغها نصّاً'}
        </button>
      )}
      {showTxt && transcript && <div className="xs" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{transcript}</div>}
      {err && <div className="err">{err}</div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 🖼️ فقاعة الصورة — تُعرض في مكانها من المحادثة
// ══════════════════════════════════════════════════════
// المسار نفسه الذي يخدم الصوت (`/messages/:id/media`) يقرأ `payload.image.id`
// أصلاً — فالصورة كانت مدعومةً في الخادم وينقصها من يعرضها فقط.
// 🔴 سلوك البوت لا يتغيّر: `extractInbound` يحوّل الصورة إلى نصّ «📷 صورة»
//    ولا شيء يمرّرها إلى النموذج — فيبقى الدون يعتذر عن قراءتها.
export function ImageBubble({ m, onOpen }: { m: any; onOpen: (url: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    let made: string | null = null;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/whatsapp/messages/${m.id}/media`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.error || `تعذّر الجلب (${res.status})`);
        }
        made = URL.createObjectURL(await res.blob());
        if (dead) { URL.revokeObjectURL(made); return; }
        setUrl(made);
      } catch (e: any) { if (!dead) setErr(e.message); }
    })();
    return () => { dead = true; if (made) URL.revokeObjectURL(made); };
  }, [m.id]);

  const caption = m.body && m.body !== '📷 صورة' && m.body !== '🩵 ملصق' ? m.body : '';
  return (
    <div style={{ minWidth: 160 }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="صورة من العميل" onClick={() => onOpen(url)}
          style={{ cursor: 'zoom-in', maxWidth: 220, maxHeight: 260, objectFit: 'cover', display: 'block' }} />
      ) : err ? (
        <div className="err">{err}</div>
      ) : (
        <div className="wa-skel" style={{ width: 200, height: 136 }} />
      )}
      {caption && <p style={{ marginTop: 6 }}>{caption}</p>}
      <div className="muted" style={{ font: '500 12px/16px var(--font-sans)', marginTop: 4 }}>
        {m.msgType === 'sticker' ? 'ملصق' : 'صورة'} · الدون لا يقرأ الصور
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 🖼️ فقاعة الصورة الصادرة — من رابطنا مباشرةً
// ══════════════════════════════════════════════════════
// لا حاجة لوكيل `/messages/:id/media` هنا: `payload.image.link` هو الرابط المطلق
// الذي سحبت ميتا الصورةَ منه، مخدومٌ عامّاً من `/uploads/` — فيُستعمل كما هو بلا
// بادئة API_URL (هو مطلقٌ أصلاً بـPUBLIC_URL).
/** 🎬 فيديو أرسلناه نحن (البثّ) — رابطُنا العامّ في الحمولة يكفي، كالصورة */
export function OutVideoBubble({ m }: { m: any }) {
  const link: string = m.payload?.video?.link || '';
  const [err, setErr] = useState(false);
  const caption = m.body && m.body !== '🎬 فيديو' ? m.body : '';
  return (
    <div style={{ minWidth: 180 }}>
      {err ? (
        <div className="err">تعذّر عرض الفيديو — وصل العميل كما في السجلّ</div>
      ) : (
        <video src={link} controls preload="metadata" onError={() => setErr(true)}
          style={{ maxWidth: 240, maxHeight: 300, background: '#000', display: 'block' }} />
      )}
      {caption && <p style={{ marginTop: 6 }}>{caption}</p>}
    </div>
  );
}

export function OutImageBubble({ m, onOpen }: { m: any; onOpen: (url: string) => void }) {
  const link: string = m.payload?.image?.link || '';
  const [err, setErr] = useState(false);
  const caption = m.body && m.body !== '📷 صورة' ? m.body : '';
  return (
    <div style={{ minWidth: 160 }}>
      {err ? (
        <div className="err">تعذّر عرض الصورة — وصلت العميل كما في السجلّ</div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={link} alt="صورة مرسلة" onError={() => setErr(true)} onClick={() => onOpen(link)}
          style={{ cursor: 'zoom-in', maxWidth: 220, maxHeight: 260, display: 'block' }} />
      )}
      {caption && <p style={{ marginTop: 6 }}>{caption}</p>}
    </div>
  );
}

/** فيديو أو ملفّ: حبّةُ تنزيلٍ لا مشغّل — اللوحة ليست مكان المشاهدة */
export function FileBubble({ m }: { m: any }) {
  const [busy, setBusy] = useState(false);
  const grab = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/whatsapp/messages/${m.id}/media`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('تعذّر الجلب');
      const u = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = u; a.download = m.body || 'file';
      a.click();
      setTimeout(() => URL.revokeObjectURL(u), 5000);
    } catch (e: any) { swalToast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  return (
    <button type="button" className="voice" onClick={grab} disabled={busy}
      style={{ border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', textAlign: 'start', padding: 0 }}>
      <span className="play" style={{ background: 'var(--info-soft)', color: 'var(--info)' }}>{m.msgType === 'video' ? <Video /> : <FileText />}</span>
      <span className="grow">
        <span style={{ display: 'block', font: '500 14px/20px var(--font-sans)' }}>{m.body || (m.msgType === 'video' ? 'فيديو' : 'ملفّ')}</span>
        <span className="muted" style={{ display: 'block', font: '500 12px/16px var(--font-sans)' }}>{busy ? 'جارٍ التنزيل…' : 'اضغط للتنزيل'}</span>
      </span>
    </button>
  );
}

// ══════════════════════════════════════════════════════
// 🖼️ صورة المتواصل
// ══════════════════════════════════════════════════════
// واتساب لا يرسل صورة العميل إطلاقاً (الويبهوك يحمل الاسم فقط، ولا endpoint لصورة
// رقمٍ آخر في Cloud API — منعٌ مقصود من ميتا). فالمصدر الوحيد هو صورة حسابه في تطبيق
// اللاعب إن كانت المحادثة مربوطة. ومن لا صورة له: حرفٌ بلونٍ **ثابت مشتقّ من رقمه**
// لا رماديٌّ موحَّد — فلكلّ شخصٍ هويّة بصريّة تُميّزه في القائمة.
const AVATAR_HUES = [205, 262, 158, 345, 24, 174, 292, 84, 190, 232];
export function hueOf(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_HUES[h % AVATAR_HUES.length];
}

/** size: sm 36 · md 44 · lg 56 — `ch` يضيف شارة القناة في الزاوية */
export function ConvAvatar({ c, size = 'md', ch }: { c: any; size?: 'sm' | 'md' | 'lg'; ch?: 'cloud' | 'web' | null }) {
  const [broken, setBroken] = useState(false);
  const label = (c?.playerName || c?.displayName || c?.phone || '?').trim().charAt(0) || '؟';
  const src = c?.avatarUrl && !broken ? `${API_URL}${c.avatarUrl}` : null;
  const linked = !!c?.playerId || !!src;
  const cls = `wa-avatar${size === 'sm' ? ' sm' : size === 'lg' ? ' lg' : ''}${linked ? ' linked' : ''}`;
  const tint = linked ? undefined : { background: `hsl(${hueOf(String(c?.phone || label))} 32% 24%)` };
  return (
    <span className={cls} style={tint} title={src ? 'صورة حسابه في التطبيق' : linked ? 'حساب لاعب مربوط' : 'رقم غير مربوط بحساب'}>
      {src
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={src} alt="" onError={() => setBroken(true)} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
        : label}
      {ch && <span className="ch" style={{ color: ch === 'web' ? 'var(--ch-web)' : 'var(--ch-meta)' }}>{ch === 'web' ? <Smartphone /> : <Cloud />}</span>}
    </span>
  );
}
