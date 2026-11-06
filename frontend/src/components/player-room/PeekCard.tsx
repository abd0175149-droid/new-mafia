'use client';

// ══════════════════════════════════════════════════════
// 🎴 الكرت بالضغط المطوّل (2026-11-06)
// نفس الكرت ونفس القلبة. الوجه السرّيّ لا يُمرَّر للكرت إلّا وهو مقلوب
// (role=null قبله وبعد انتهاء قلبة الرجوع) — فلا يوجد دورٌ في الصفحة قبل الضغط.
//
// 🔁 بعد أوّل ليلةٍ حيّة: كان يُقلب ما دام الإصبع ضاغطاً، والإصبع فوق الكرت يغطّي
//    الاسم والدور. الآن: ضغطٌ مطوّل يقلبه ويبقى مقلوباً بعد رفع الإصبع، ولمسةٌ تعيده
//    (ويعود وحده بعد مهلة أو عند مغادرة التطبيق).
// ══════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import MafiaCard from '../MafiaCard';
import SecretWatermark from '../SecretWatermark';
import { useHold } from './HoldReveal';

interface Props {
  seat: number;
  name: string;
  role: string | null;
  gender?: 'MALE' | 'FEMALE';
  avatarUrl?: string | null;
  watermark: string;
  rankTier?: string;
  cosmetics?: any;
  /** false = غطاءٌ فقط (قبل التوزيع) */
  peekable: boolean;
  onPeek?: () => void;
}

const FLIP_MS = 550;

export default function PeekCard({ seat, name, role, gender, avatarUrl, watermark, rankTier, cosmetics, peekable, onPeek }: Props) {
  const { open, bind, close } = useHold(onPeek, { autoCloseMs: 15_000 });
  const [shownRole, setShownRole] = useState<string | null>(null);
  useEffect(() => {
    if (open) { setShownRole(role); return; }
    const t = setTimeout(() => setShownRole(null), FLIP_MS + 50);
    return () => clearTimeout(t);
  }, [open, role]);
  // مقلوبٌ ⇒ لمسةٌ واحدة تعيده؛ مغلقٌ ⇒ الضغط المطوّل يقلبه
  const handlers = open
    ? { onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); close(); }, onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
        onKeyDown: (e: React.KeyboardEvent) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); close(); } } }
    : bind;

  return (
    <div className="relative mx-auto" style={{ width: 'fit-content', touchAction: 'manipulation', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as React.CSSProperties}
      {...(peekable ? handlers : {})} role={peekable ? 'button' : undefined} tabIndex={peekable ? 0 : undefined}
      aria-label={peekable ? (open ? 'المس لإخفاء دورك' : 'اضغط مطوّلاً لكشف دورك') : undefined}>
      <MafiaCard
        playerNumber={seat} playerName={name} role={open ? role : shownRole}
        isFlipped={peekable && open} flippable={false} flipDurationMs={FLIP_MS}
        gender={gender} size="md" avatarUrl={avatarUrl} rankTier={rankTier} cosmetics={cosmetics}
      />
      {open && <SecretWatermark label={watermark} opacity={0.08} />}
    </div>
  );
}
