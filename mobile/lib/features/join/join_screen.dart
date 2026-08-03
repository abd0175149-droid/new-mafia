import 'package:flutter/material.dart';

import '../../app/router.dart';
import '../../app/theme/theme.dart';
import '../profile/profile_palette.dart';

// ══════════════════════════════════════════════════════
// 🚪 الدخول إلى غرفة — الملفّ 21 (لم يُبنَ بعد)
// ══════════════════════════════════════════════════════
// المسار حيّ من اليوم لأن الراوتر يحتاجه: `/join/:code` هو ما يفتحه رمز
// QR على الطاولة، و`/player/join?code=…&invite=1` ما يفتحه إشعار الدعوة.
// الشاشة تُظهر ما وصلها بدل أن تُسقط الرابط صامتة — فحين تصل شاشة
// اللوبي الحقيقية لا يتغيّر شيء في طبقة التوجيه.

class JoinScreen extends StatelessWidget {
  const JoinScreen({
    super.key,
    this.initialCode,
    this.invite = false,
    this.inviterName,
    this.bare = false,
  });

  /// من `/join/:code` أو من `?code=`
  final String? initialCode;

  /// `invite=1` — الدعوة تُؤكَّد قبل أيّ انضمام صامت
  final bool invite;
  final String? inviterName;

  /// الرابط العاري خارج الغلاف: بلا شريط تنقّل، وبلا بوّابة إشعارات.
  final bool bare;

  @override
  Widget build(BuildContext context) {
    final code = initialCode?.trim();

    final body = SafeArea(
      child: Center(
        child: Padding(
          padding: EdgeInsets.only(bottom: bare ? 0 : 80, left: 24, right: 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.verified_user_outlined, size: 56, color: Color(0xFF334155)),
              const SizedBox(height: 16),
              Text(invite ? 'دعوة إلى غرفة' : 'الدخول إلى غرفة',
                  style: Theme.of(context).textTheme.headlineMedium),
              if (invite && (inviterName?.isNotEmpty ?? false)) ...[
                const SizedBox(height: 6),
                Text('دعاك ${inviterName!}', style: ar(13, color: Tw.gray400)),
              ],
              if (code != null && code.isNotEmpty) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    color: const Color(0x14FBBF24),
                    border: Border.all(color: const Color(0x33FBBF24)),
                  ),
                  // الكود لاتينيّ محض — يُلفّ باتجاهه
                  child: Directionality(
                    textDirection: TextDirection.ltr,
                    child: Text(code,
                        style: monoStyle(size: 22, weight: FontWeight.w700, color: Tw.amber400)),
                  ),
                ),
              ],
              const SizedBox(height: 16),
              Text('شاشة اللوبي تصل مع طبقة اللعب',
                  textAlign: TextAlign.center, style: ar(12, color: Tw.gray500)),
              const SizedBox(height: 4),
              Directionality(
                textDirection: TextDirection.ltr,
                child: Text('21-join-lobby.md',
                    style: monoStyle(size: 11, color: MafiaScales.dark[600]!)),
              ),
            ],
          ),
        ),
      ),
    );

    if (!bare) return body;
    // الرابط العاري قد يُفتح من رمز QR على بدءٍ بارد فلا شيء تحته —
    // زرّ الرجوع يذهب للرئيسية بدل الخروج من التطبيق.
    return PopsToHome(
      child: Scaffold(backgroundColor: Noir.pitchBlack, body: body),
    );
  }
}
