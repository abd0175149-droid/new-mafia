'use client';

// ══════════════════════════════════════════════════════
// 🔗 غلاف الدخول برابط الغرفة — /join/[roomCode]
//
// 🔴 هذا المسار **خارج** /player، فلا يرث غلافه: لا PlayerProvider ولا بوّابة
//    الموقع. وهو الطريق الذي يصل منه أكثر اللاعبين فعليّاً (رابط الدعوة)، فكان
//    من يدخل منه لا يُسأل الإذن ولا يُسجَّل موقعه أبداً — والسياج صامتٌ عنه.
//
//    البديل «انقل الصفحة تحت /player» يكسر كلّ روابط الدعوة المرسَلة سلفاً،
//    فالغلاف هنا هو الحلّ: نفس المزوّد ونفس البوّابة، بلا تغيير أيّ رابط.
// ══════════════════════════════════════════════════════

import { PlayerProvider } from '@/context/PlayerContext';
import LocationGate from '@/components/LocationGate';

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return (
    <PlayerProvider>
      {children}
      <LocationGate />
    </PlayerProvider>
  );
}
