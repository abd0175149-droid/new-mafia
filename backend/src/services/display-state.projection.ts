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

import { isMafiaRole } from '../game/roles.js';

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
    teamCounts: {
      mafiaAlive: alive.filter((p: any) => p.role && isMafiaRole(p.role)).length,
      citizenAlive: alive.filter((p: any) => p.role && !isMafiaRole(p.role)).length,
    },
    gameTimer: state.gameTimer || null,
  };
}
