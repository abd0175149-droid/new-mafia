'use client';

import { useEffect, useState } from 'react';
import { getSocket, reconnectSocketAuth } from '@/lib/socket';

// ══════════════════════════════════════════════════════
// 🪙 مظهر اللاعب داخل تطبيقه
//
// ⚠️ لماذا وُجد هذا الخطّاف: كل ما يشتريه اللاعب كان يظهر على شاشة القاعة فقط.
//    بطاقته في يده طوال السهرة تُرسم بلا إطار ولا لقب ولا تأثير اسم ولا رتبة،
//    والخادم يبثّ `chips:cosmetics-updated` على غرفة اللاعب منذ البداية —
//    **ولا مستمع له في الواجهة كلها**. فقيمة كل شراء تنهار إلى «فقط حين أكون
//    في النادي وأنظر إلى التلفاز في اللحظة الصحيحة».
//
// ثلاث قنوات تحديث، كي لا يعتمد الظهور على واحدة قد تنقطع:
//   1) جلب أوّلي عند التركيب
//   2) بثّ لحظي على غرفة `player:{id}`
//   3) إعادة جلب عند عودة الصفحة للواجهة (الهاتف ينام كثيراً)
// ══════════════════════════════════════════════════════

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export interface PlayerCosmetics {
  frame?: { config?: any; emblemId?: string | null } | null;
  title?: { config?: { text?: string; style?: string; plaque?: any } } | null;
  nameFx?: { config?: { nameEffect?: any } } | null;
  entrance?: any;
  elimination?: any;
}

export function usePlayerCosmetics() {
  const [cosmetics, setCosmetics] = useState<PlayerCosmetics | null>(null);
  const [rankTier, setRankTier] = useState<string | null>(null);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('mafia_player_token') : null;
    if (!token) return;

    let alive = true;
    const load = () => {
      fetch(`${API_URL}/api/chips/store/cosmetics`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => (r.ok ? r.json() : null))
        .then(d => {
          if (!alive || !d?.success) return;
          setCosmetics(d.cosmetics || null);
          if (d.rankTier) setRankTier(d.rankTier);
        })
        .catch(() => { /* المظهر زخرفة — فشله لا يعطّل شيئاً */ });
    };
    load();

    // بثّ لحظي: تجهيز عنصر من المتجر يظهر على البطاقة بلا إعادة تحميل
    const socket = getSocket();

    // ⚠️ البثّ يصل على غرفة `player:{id}`، والانضمام إليها يقع **مرّة واحدة
    //    عند الاتصال** من رمز المصافحة. فإن كان السوكِت قد اتّصل قبل أن
    //    يُكتب الرمز (وهو ترتيب شائع: السوكِت وحدة مفردة تُنشأ عند أول
    //    استيراد)، فاللاعب ليس في الغرفة ولن يدخلها أبداً — وتوسيع قراءة
    //    الرمز في الجلب لا يفيده إطلاقاً. نُعيد المصافحة برمزٍ حاضر.
    try {
      const handshakeToken = (socket as any)?.auth?.playerToken;
      if (!handshakeToken) reconnectSocketAuth();
    } catch { /* البثّ تحسين لا شرط — الجلب الأوّلي يكفي */ }

    const onUpdate = (p: { cosmetics?: PlayerCosmetics }) => {
      if (alive) setCosmetics(p?.cosmetics || null);
    };
    socket.on('chips:cosmetics-updated', onUpdate);

    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive = false;
      socket.off('chips:cosmetics-updated', onUpdate);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return { cosmetics, rankTier };
}
