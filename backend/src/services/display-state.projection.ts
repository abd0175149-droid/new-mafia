// ══════════════════════════════════════════════════════
// 📺 إسقاط حالة الشاشة — Display state projection
//
// ⚠️ لماذا مكان واحد: كان مسار REST يبني قائمة حقول صريحة (اسم · دور ·
//    حياة · رتبة …) بينما معالج السوكِت الشقيق يُعيد `getRoom()` **خاماً**.
//    مصدران لنفس الردّ يعني أن تنقية أحدهما لا تحمي الآخر — وهذا ما وقع:
//    أُغلق مسار REST وبقي السوكِت يُسرّب كل شيء.
//
//    كل مَن يردّ حالةً لشاشة عرض يمرّ من هنا. أي حقل جديد يُضاف مرة واحدة،
//    وأي حقل حسّاس يُحذف مرة واحدة.
// ══════════════════════════════════════════════════════

import { isMafiaRole, getTeamCounts } from '../game/roles.js';

export function projectDisplayState(state: any) {
  if (!state) return null;
  const players = Array.isArray(state.players) ? state.players : [];
  const alive = players.filter((p: any) => p.isAlive);

  return {
    phase: state.phase,
    players: players.map((p: any) => ({
      physicalId: p.physicalId,
      name: p.name,
      isAlive: p.isAlive,
      gender: p.gender,
      role: p.role,
      avatarUrl: p.avatarUrl || null,
      rankTier: p.rankTier || 'INFORMANT',
      // 🎨 المظاهر المدفوعة جزء من الحالة التي ترسمها الشاشة —
      //    إسقاطها هنا يعني اختفاء ما دفع اللاعب ثمنه عن شاشة القاعة.
      cosmetics: p.cosmetics || null,
    })),
    winner: state.winner || null,
    discussionState: state.discussionState || null,
    // 🔴 من المصدر الموحّد لا بحسابٍ مكرّر: النسخة المحلّيّة كانت تعدّ
    //    المحايد مواطناً — وهي ثالثة ثلاث نسخٍ من الخطأ نفسه.
    teamCounts: getTeamCounts(state.players as any),
    gameTimer: state.gameTimer || null,

    // ── 🗺️ ما تحتاجه خريطة المقاعد على الشاشة (D1) ──
    // البيانات كانت في الحالة الخام وتصل الشاشة عبر السوكِت، لكنّ مسار REST
    // كان يُسقطها فتختلف أوّل رسمة عن كلّ ما بعدها.
    maxPlayers: state.config?.maxPlayers ?? null,
    pinnedSeats: state.pinnedSeats || [],
    reservedTailSeats: state.reservedTailSeats || 0,
    doorSeats: state.doorSeats || [],
    // مقاعدُ محجوزة/مجمَّدة: تُعرض شاغرةً-محجوزة كي لا يجلس فيها واصلٌ جديد
    heldSeats: players.filter((p: any) => p.seatHeld).map((p: any) => p.physicalId),
    frozenSeats: players.filter((p: any) => p.frozen).map((p: any) => p.physicalId),
    // 👁️ المنتظرون — الاسم الأوّل ورقم المقعد فقط (القرار المقفل ٦)
    spectators: (Array.isArray(state.spectators) ? state.spectators : []).map((sp: any) => ({
      physicalId: sp.physicalId,
      firstName: String(sp.name || '').trim().split(/\s+/)[0] || sp.name,
    })),
    // ⏱️ موعد الجولة القادمة (D2)
    nextGameAt: (state as any).nextGameAt || null,
  };
}
