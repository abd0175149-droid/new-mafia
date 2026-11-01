'use client';

// ══════════════════════════════════════════════════════
// 📸 شارة «التصوير» داخل الغرفة — زاوية بلا تصوير
// ══════════════════════════════════════════════════════
// تظهر فقط حين تكون الزاوية مفعّلة في الغرفة (photoZoneOn). اللمس يفتح
// ورقة تأكيد، والتأكيد يُرسل room:set-photo-consent. الخادم لا ينقل اللاعب —
// يُبلغ الموجّه وحده، وقد ينقله الموجّه بيده.
// ══════════════════════════════════════════════════════

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import FixedLayer from './FixedLayer';

interface Props {
  roomId: string;
  noPhoto: boolean;
  emit: (event: string, data: any) => Promise<any>;
  onChanged: (noPhoto: boolean) => void;
  onToast: (message: string, type: 'success' | 'warning' | 'info') => void;
  className?: string;
}

export default function PhotoConsentChip({ roomId, noPhoto, emit, onChanged, onToast, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // الطلب: عكس الحالة الحاليّة
  const wantConsent = noPhoto;

  const confirm = async () => {
    if (busy || !roomId) return;
    setBusy(true);
    setErr('');
    try {
      const res: any = await emit('room:set-photo-consent', { roomId, photoConsent: wantConsent });
      const np = res?.noPhoto === true;
      onChanged(np);
      setOpen(false);
      // القاصر يبقى بلا تصوير مهما طلب
      if (wantConsent && np && res?.isMinor) onToast('تحت ١٨: بموافقة وليّ الأمر عبر الموجّه', 'warning');
      else onToast('أُبلغ الموجّه — قد ينقلك لمقعدٍ آخر', 'success');
    } catch (e: any) {
      setErr(e?.response?.code === 'DISABLED' ? 'الميزة غير مفعّلة الآن' : (e?.message || 'تعذّر الحفظ'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setErr(''); setOpen(true); }}
        className={`w-full min-h-[44px] flex items-center justify-center gap-2 px-3 rounded-lg border transition-all text-[13px] font-bold ${
          noPhoto
            ? 'bg-sky-950/30 border-sky-500/40 text-sky-300'
            : 'bg-black/40 border-[#2a2a2a] text-[#C5A059] hover:border-[#C5A059]/50'
        } ${className}`}
        style={{ fontFamily: 'Amiri, serif' }}
      >
        {noPhoto ? '📵 بلا تصوير' : '📸 التصوير: مسموح'}
        <span className="text-[12.5px] text-[#9a9a9a] font-normal">· تغيير</span>
      </button>

      <FixedLayer>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
              onClick={() => !busy && setOpen(false)}
              dir="rtl"
            >
              <motion.div
                initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-[#111] border border-[#C5A059]/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center"
              >
                <h3 className="text-[#C5A059] text-xl font-bold mb-2" style={{ fontFamily: 'Amiri, serif' }}>
                  {wantConsent ? '📸 السماح بالتصوير؟' : 'تغيير إلى: 📵 بلا تصوير؟'}
                </h3>
                <p className="text-[#9a9a9a] text-[13px] mb-5 leading-relaxed" style={{ fontFamily: 'Amiri, serif' }}>
                  يُبلَّغ الموجّه بتغييرك، وقد ينقلك لمقعدٍ آخر.
                </p>
                {err && <p className="text-[#ff6b6b] text-[13px] text-center mb-4 bg-[#8A0303]/15 p-2 rounded">{err}</p>}
                <div className="flex gap-3">
                  <button
                    onClick={() => setOpen(false)}
                    disabled={busy}
                    className="flex-1 min-h-[48px] rounded-xl border border-[#333] text-[#9a9a9a] text-[14px] hover:bg-[#222] transition-colors disabled:opacity-50"
                  >
                    إلغاء
                  </button>
                  <button
                    onClick={confirm}
                    disabled={busy}
                    className="flex-1 min-h-[48px] rounded-xl bg-[#8A0303] text-white text-[14px] font-bold shadow-[0_0_15px_rgba(138,3,3,0.4)] hover:bg-[#a00404] transition-colors disabled:opacity-50"
                  >
                    {busy ? '...' : 'تأكيد'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </FixedLayer>
    </>
  );
}
