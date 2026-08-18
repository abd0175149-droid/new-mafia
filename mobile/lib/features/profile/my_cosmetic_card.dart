import 'package:flutter/material.dart';

import '../../app/theme/dimens.dart';
import '../../core/api/game_config_service.dart';
import '../../core/cosmetics/cosmetics_service.dart';
import '../../models/profile.dart';
import '../cosmetics/mafia_card_view.dart';
import 'profile_palette.dart';

// ══════════════════════════════════════════════════════
// 🪙 «بطاقتي بمظهري» — §4.1 في الملفّ 34
// ══════════════════════════════════════════════════════
// 🔴 كل ما يشتريه اللاعب كان يظهر على شاشة القاعة فقط، وبطاقته في يده
//    طوال السهرة تُرسم عارية. فقيمة كل شراء تنهار إلى «فقط حين أكون في
//    النادي وأنظر إلى التلفاز في اللحظة الصحيحة». **المظهر يجب أن يكون
//    حاضراً في يد صاحبه.**
//
// 🔴 يظهر القسم **فقط** إن وُجد إطارٌ أو لقبٌ أو تأثير اسم — ولا شيء
//    يُعرض لمن لم يشترِ بعد. والقراءة من المزوّد لا من بناءٍ مشروط:
//    ترتيبٌ مشروطٌ كهذا أسقط صفحة الويب مرّةً بتغيّر عدد الخطّافات.

class MyCosmeticCard extends StatelessWidget {
  const MyCosmeticCard({super.key, required this.player});

  final PlayerInfo player;

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: CosmeticsService.instance,
        builder: (_, __) {
          final svc = CosmeticsService.instance;
          if (!svc.hasAny) return const SizedBox.shrink();

          // البطاقة `lg` على العريض و`sm` دونه — المظهر يتبع البطاقة
          final big = context.sizeClass == WindowSizeClass.expanded;

          return Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 16),
              decoration: solidCard(border: const Color(0x26FBBF24)),
              child: Column(children: [
                Text('🪙 بطاقتي بمظهري',
                    style: ar(13, color: Tw.amber400, weight: FontWeight.w900)),
                const SizedBox(height: 4),
                Text('هكذا يراك كل من في القاعة',
                    style: ar(10.5, color: Tw.gray500)),
                const SizedBox(height: 16),
                // متنفَّسٌ علويّ للشعار الطافي — القصّ بلا متنفَّس يبتر التاج
                Padding(
                  padding: EdgeInsets.only(top: big ? 30 : 20),
                  child: MafiaCardView(
                    size: big ? CardSize.lg : CardSize.sm,
                    playerName: player.name.isEmpty ? 'أنت' : player.name,
                    avatarUrl: player.avatarUrl,
                    // 🔴 هويّة اللاعبة تغيّر لهجة البطاقة وصورتها
                    //    الافتراضيّة. بلا تمريرها ترى اللاعبة بطاقةً
                    //    «ذكوريّة» — والبطاقة تُوصف بأنها «كما يراك كلّ من
                    //    في القاعة» (STORE-5).
                    isFemale: player.isFemale,
                    cosmetics: svc.cosmetics,
                    template: GameConfigService.instance.master,
                    rankFx:
                        GameConfigService.instance.effectsForTier(svc.rankTier),
                  ),
                ),
              ]),
            ),
          );
        },
      );
}
