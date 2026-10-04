import { samePhone } from '../utils/phone.util.js';
import { verifyPlayerToken } from '../middleware/player-auth.middleware.js';

// ══════════════════════════════════════════════════════
// 🪪 مَن يملك هذا المقعد؟ — الهويّةُ من توكن المقبس، لا من الحمولة
// ──────────────────────────────────────────────────────
// 🔴 كانت العودةُ (rejoin-player) واستعلامُ الحالة (get-my-state) والانضمامُ أثناء اللعب
//    تأخذ `playerId` و`phone` كما يرسلها العميل. ومعرّفاتُ اللاعبين وهواتفُهم كانت في
//    كلّ بثّ — فأيُّ هاتفٍ يرسل معرّفَ غيره يربط مقبسَه بمقعده: يرى دورَه وفريقَه
//    ويصوّت باسمه.
//    القاعدة الآن: مقعدٌ مربوطٌ بحساب لا يُستردّ إلّا بتوكن ذلك الحساب. والضيفُ (مقعدٌ
//    بلا حساب) يُستردّ بهاتفه كما كان.
// ══════════════════════════════════════════════════════
export function resolveSeatClaim(
  state: any,
  socket: any,
  data: { playerId?: number | null; phone?: string | null; playerToken?: string | null },
): { player?: any; error?: 'IDENTITY_MISMATCH' | 'LOGIN_REQUIRED' } {
  // التوكن من المصافحة، وإلّا من الحمولة (مقبسٌ فُتح قبل تسجيل الدخول لا يحمله في المصافحة)
  let auth = socket?.data?.authPlayer as { playerId: number; phone?: string } | undefined;
  if (!auth && data.playerToken) {
    const t = verifyPlayerToken(String(data.playerToken));
    if (t?.playerId) auth = { playerId: t.playerId, phone: (t as any).phone };
  }
  const players: any[] = state?.players || [];

  // مقبسٌ مربوطٌ أصلاً بهذا المقعد في هذه الغرفة (دخل منه بانضمامٍ مشروع) — يبقى له
  const boundSeat = socket?.data?.role === 'player' && socket?.data?.roomId === state?.roomId
    ? players.find((p) => p.physicalId === socket.data.physicalId)
    : undefined;
  if (!auth && boundSeat && (
    (data.playerId != null && Number(boundSeat.playerId) === Number(data.playerId)) ||
    (!!data.phone && !!boundSeat.phone && (boundSeat.phone === data.phone || samePhone(boundSeat.phone, data.phone)))
  )) {
    return { player: boundSeat };
  }
  const phoneMatch = (p: any, ph?: string | null) => !!ph && !!p.phone && (p.phone === ph || samePhone(p.phone, ph));

  if (auth?.playerId) {
    if (data.playerId != null && Number(data.playerId) !== Number(auth.playerId)) return { error: 'IDENTITY_MISMATCH' };
    const byId = players.find((p) => p.playerId && Number(p.playerId) === Number(auth.playerId));
    if (byId) return { player: byId };
    // مقعدُ ضيفٍ بهاتف صاحب التوكن (أُضيف بالهاتف قبل ربطه بالحساب)
    const ph = auth.phone || data.phone;
    return { player: players.find((p) => phoneMatch(p, ph) && (!p.playerId || Number(p.playerId) === Number(auth.playerId))) };
  }

  // بلا توكن: لا ادّعاءَ لمقعدٍ مربوطٍ بحساب
  if (data.playerId != null && players.some((p) => p.playerId && Number(p.playerId) === Number(data.playerId))) {
    return { error: 'LOGIN_REQUIRED' };
  }
  const byPhone = players.find((p) => phoneMatch(p, data.phone));
  if (byPhone?.playerId) return { error: 'LOGIN_REQUIRED' };
  return { player: byPhone };
}

export const SEAT_CLAIM_ERRORS: Record<string, string> = {
  IDENTITY_MISMATCH: 'الحساب المسجَّل على هذا الجهاز غير صاحب المقعد',
  LOGIN_REQUIRED: 'سجّل دخولك من حسابك لتعود إلى مقعدك',
};
