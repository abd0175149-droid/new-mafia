// ══════════════════════════════════════════════════════
// 🏆 بدء موسم عادي جديد (أداة تشغيل) — نفس منطق POST /api/seasons/regular/start
// ══════════════════════════════════════════════════════
// يثبّت أرشيف الموسم المنتهي ثم يبدأ الموسم الجديد ويصفّر رانك الجميع.
//
// الحُرّاس (بنفس ترتيب المسار الفعليّ):
//   1. لا غرفة في مرحلة لعب — يُقرأ من Redis مباشرة (أدقّ من activeRooms في ذاكرة الخادم).
//   2. تسوية أي غرفة منتهية بمباراة غير محتسبة — محسومة ⇒ تُحتسب للموسم القديم،
//      بلا فائز ⇒ تُلغى. (وإلا احتُسبت لاحقاً في الموسم الجديد فسرّبت لعبةً إليه.)
//   3. startRegularSeason: مصالحة تثبيت كاملة للأرشيف → إنهاء → موسم جديد → تصفير players.*
//
// التشغيل:
//   docker compose exec -T backend npx tsx src/scripts/start-regular-season.ts --name "اسم الموسم"
//   أضف --dry-run لفحص الجاهزية بلا أي كتابة.
//   🔮 تفعيل المسودّة المعلّقة (موسم النبوءة): --from-draft بدل --name — الاسم والمحتوى من المسودّة.
// ══════════════════════════════════════════════════════

import { connectDB, getDB } from '../config/db.js';
import { connectRedis, getAllGameStates } from '../config/redis.js';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FROM_DRAFT = args.includes('--from-draft');
const nameIdx = args.indexOf('--name');
let SEASON_NAME = nameIdx >= 0 ? String(args[nameIdx + 1] || '').trim() : '';

// مراحل تعني أن لعبةً جارية فعلاً (لا يجوز التبديل أثناءها)
const IDLE_PHASES = new Set(['LOBBY', 'GAME_OVER']);

async function main() {
  if (FROM_DRAFT && SEASON_NAME) {
    console.error('❌ إمّا --from-draft (الاسم من المسودّة) أو --name — لا الاثنان معاً');
    process.exit(1);
  }
  if (!FROM_DRAFT && !SEASON_NAME) {
    console.error('❌ اسم الموسم مطلوب:  --name "اسم الموسم"  (أو --from-draft لتفعيل المسودّة)');
    process.exit(1);
  }

  console.log(`🏆 بدء موسم عادي جديد: «${SEASON_NAME || '(من المسودّة)'}» — الوضع: ${DRY_RUN ? '🔍 فحص فقط (بلا كتابة)' : '⚠️  تنفيذ فعليّ'}`);

  await connectRedis();
  await connectDB();
  if (!getDB()) { console.error('❌ قاعدة البيانات غير متاحة'); process.exit(1); }

  // 🔮 المسودّة: تُقرأ قبل الحرّاس كي يُطبع اسمها ومحتواها في الفحص
  let draft: { id: number; name: string; contentPack: string } | null = null;
  if (FROM_DRAFT) {
    const { getPendingSeasonDraft } = await import('../services/season.service.js');
    draft = await getPendingSeasonDraft();
    if (!draft) { console.error('❌ لا مسودّة معلّقة للتفعيل'); process.exit(1); }
    SEASON_NAME = draft.name;
    console.log(`🔮 المسودّة #${draft.id}: «${draft.name}» — المحتوى ${draft.contentPack}`);
  }

  const { getActiveRegularSeasonId, startRegularSeason } = await import('../services/season.service.js');
  const { finalizeIfDecided } = await import('../services/match.service.js');

  const currentId = await getActiveRegularSeasonId();
  console.log(`📌 الموسم العادي النشط حالياً: ${currentId ?? '(لا يوجد)'}`);

  // ── 1) حارس الغرف الجارية ──
  const states = await getAllGameStates();
  const busy = states.filter((s: any) => s?.phase && !IDLE_PHASES.has(s.phase));
  if (busy.length > 0) {
    console.error(`❌ توجد ${busy.length} غرفة/غرف في وضع لعب — أنهِ الفعاليات أولاً:`);
    for (const s of busy) console.error(`   • ${s.roomId} (${s.roomCode}) — ${s.phase} — ${s.config?.gameName || ''}`);
    process.exit(1);
  }
  console.log(`✅ لا غرف في وضع لعب (حالات Redis: ${states.length})`);

  // ── 2) تسوية الغرف المنتهية بمباراة غير محتسبة ──
  const pending = states.filter((s: any) => s?.matchId);
  if (pending.length > 0) {
    console.log(`🧮 تسوية ${pending.length} مباراة معلّقة قبل التبديل…`);
    for (const s of pending) {
      if (DRY_RUN) { console.log(`   (فحص) ${s.roomId} — matchId ${s.matchId}, winner: ${s.winner ?? s.pendingWinner ?? 'بلا'}`); continue; }
      const counted = await finalizeIfDecided(s as any).catch(() => false);
      console.log(`   ${counted ? '✅ احتُسبت' : '🗑️ أُلغيت'} — ${s.roomId} (matchId ${s.matchId})`);
    }
  } else {
    console.log('✅ لا مباريات معلّقة تحتاج تسوية');
  }

  // ── 🏙️ ما سيُجمَّد: صفوفُ كلّ مدينةٍ في الموسم الحاليّ ──
  if (currentId) {
    try {
      const { getSeasonCityStats } = await import('../services/season.service.js');
      const stats = await getSeasonCityStats(currentId);
      console.log(`🏙️ أرشيف الموسم #${currentId} حسب المدينة:`);
      for (const c of stats) console.log(`   • ${c.name}: ${c.players} لاعب · ${c.matches} مباراة`);
    } catch (e: any) { console.warn('⚠️ تعذّر عدّ المدن:', e?.message || e); }
  }

  if (DRY_RUN) {
    console.log('🔍 فحص الجاهزية اكتمل — كل الحُرّاس تسمح بالتبديل. أعد التشغيل بلا --dry-run للتنفيذ.');
    process.exit(0);
  }

  // ── 3) التبديل (تثبيت الأرشيف + إنهاء + موسم جديد + تصفير) ──
  let season;
  if (draft) {
    const { activateSeasonDraft } = await import('../services/season.service.js');
    season = await activateSeasonDraft(draft.id);
  } else {
    season = await startRegularSeason(SEASON_NAME);
  }
  console.log(`🎉 بدأ الموسم «${season.name}» — id=${season.id}, رقم الموسم=${season.seasonNumber}`);
  console.log('   (أُنهي الموسم السابق بعد تثبيت أرشيفه، وصُفّر رانك الجميع)');
  process.exit(0);
}

main().catch(err => { console.error('❌ فشل بدء الموسم:', err?.message || err); process.exit(1); });
