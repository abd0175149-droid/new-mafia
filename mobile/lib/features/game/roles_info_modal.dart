import 'package:flutter/material.dart';

import '../../core/api/game_config_service.dart';
import '../../models/card_template.dart';
import '../profile/profile_palette.dart';

// ══════════════════════════════════════════════════════
// 🃏 موسوعة الأدوار — §4.7 في الملفّ ٢٢
// ══════════════════════════════════════════════════════
// حيّةٌ من `/api/game-config/roles`: دورٌ يُضاف في لوحة التحكّم يظهر هنا
// بلا إصدارٍ جديد. لذا لا تُكتب القائمة يدوياً.
//
// ثيمها **أفتح** من ثيم اللعب المظلم (رماديّ `#111827`) — وهذا مقصود:
// الموسوعة مرجعٌ يُقرأ لا جزءٌ من أجواء الطاولة.

/// ثيم الفريق: العنوان ولونه ولون الحدّ ولون الاسم.
typedef _TeamTheme = ({
  String title,
  Color color,
  Color cardBorder,
  Color nameColor,
  String fallbackIcon,
});

const _teams = <String, _TeamTheme>{
  'MAFIA': (
    title: 'فريق المافيا',
    color: Color(0xFFF43F5E),
    cardBorder: Color(0x4D881337),
    nameColor: Color(0xFFFFE4E6),
    fallbackIcon: '🎭',
  ),
  'CITIZEN': (
    title: 'فريق المواطنين',
    color: Color(0xFF10B981),
    cardBorder: Color(0x4D064E3B),
    nameColor: Color(0xFFD1FAE5),
    fallbackIcon: '🛡️',
  ),
  'NEUTRAL': (
    title: 'الأدوار المستقلة',
    color: Color(0xFFF59E0B),
    cardBorder: Color(0x4D78350F),
    nameColor: Color(0xFFFEF3C7),
    fallbackIcon: '⚖️',
  ),
};

/// ⚠️ خريطةٌ خاصّة بهذا المودال — تختلف عمداً عن `roleIcons` في المعرض.
///
/// `POLICEWOMAN` في الويب `👮‍♀️` بوصلة ZWJ؛ نستعمل المفردة الآمنة `👮`
/// تبعاً لقاعدة `constants.ts` نفسها: الوصلات تتفكّك على أندرويد القديم
/// فتظهر رمزين متجاورين.
const _icons = <String, String>{
  'GODFATHER': '🎩',
  'SILENCER': '🤫',
  'CHAMELEON': '🦎',
  'MAFIA_REGULAR': '🔪',
  'SHERIFF': '🕵️',
  'DOCTOR': '🩺',
  'SNIPER': '🎯',
  'POLICEWOMAN': '👮',
  'NURSE': '💉',
  'MAYOR': '🏛️',
  'CITIZEN': '👤',
  'JESTER': '🃏',
};

Future<void> showRolesInfo(BuildContext context) => showGeneralDialog<void>(
      context: context,
      barrierDismissible: true,
      barrierLabel: 'إغلاق',
      barrierColor: const Color(0x99000000),
      transitionDuration: const Duration(milliseconds: 220),
      pageBuilder: (_, __, ___) => const RolesInfoModal(),
      transitionBuilder: (_, a, __, child) {
        final c = CurvedAnimation(parent: a, curve: Curves.easeOutCubic);
        return FadeTransition(
          opacity: c,
          child: SlideTransition(
            position:
                Tween(begin: const Offset(0, 0.04), end: Offset.zero).animate(c),
            child: ScaleTransition(
                scale: Tween(begin: 0.95, end: 1.0).animate(c), child: child),
          ),
        );
      },
    );

class RolesInfoModal extends StatefulWidget {
  const RolesInfoModal({super.key, this.rolesFuture});

  /// حقنٌ للاختبار — الإنتاج يجلب من الخدمة.
  final Future<List<RoleDef>>? rolesFuture;

  @override
  State<RolesInfoModal> createState() => _RolesInfoModalState();
}

class _RolesInfoModalState extends State<RolesInfoModal> {
  late final Future<List<RoleDef>> _future =
      widget.rolesFuture ?? GameConfigService.instance.fetchRoles();

  @override
  Widget build(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    // `items-end` على الموبايل / `sm:items-center` من 640px فصاعداً
    final sheet = w < 640;

    return Material(
      type: MaterialType.transparency,
      child: Directionality(
        textDirection: TextDirection.rtl,
        child: Stack(children: [
          Positioned.fill(
            child: GestureDetector(
              onTap: () => Navigator.of(context).maybePop(),
              behavior: HitTestBehavior.opaque,
              child: const SizedBox.shrink(),
            ),
          ),
          Align(
            alignment: sheet ? Alignment.bottomCenter : Alignment.center,
            child: Padding(
              padding: EdgeInsets.all(sheet ? 0 : 24),
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  maxWidth: 768,
                  maxHeight: MediaQuery.sizeOf(context).height * 0.85,
                ),
                child: Container(
                  decoration: BoxDecoration(
                    color: const Color(0xFF111827),
                    border: Border.all(color: const Color(0xFF1F2937)),
                    borderRadius: sheet
                        ? const BorderRadius.vertical(top: Radius.circular(24))
                        : BorderRadius.circular(24),
                    boxShadow: const [
                      BoxShadow(color: Color(0x99000000), blurRadius: 40),
                    ],
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    _header(context),
                    Flexible(child: _body()),
                    _footer(context),
                  ]),
                ),
              ),
            ),
          ),
        ]),
      ),
    );
  }

  Widget _header(BuildContext context) => Container(
        padding: const EdgeInsets.all(20),
        decoration: const BoxDecoration(
          color: Color(0x801F2937),
          border: Border(bottom: BorderSide(color: Color(0x801F2937))),
        ),
        child: Row(children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFF6366F1), Color(0xFF9333EA)],
              ),
            ),
            child: const Text('🃏', style: TextStyle(fontSize: 20)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('الكروت والأدوار', style: ar(20, weight: FontWeight.bold)),
                Text('تعرف على قدرات كل دور في اللعبة',
                    style: ar(14, color: const Color(0xFF9CA3AF))),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Material(
            color: const Color(0xFF1F2937),
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: () => Navigator.of(context).maybePop(),
              child: Container(
                width: 40,
                height: 40,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFF374151)),
                ),
                child: const Icon(Icons.close,
                    size: 18, color: Color(0xFF9CA3AF)),
              ),
            ),
          ),
        ]),
      );

  Widget _body() => FutureBuilder<List<RoleDef>>(
        future: _future,
        builder: (_, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Padding(
              padding: EdgeInsets.symmetric(vertical: 64),
              child: Center(
                child: SizedBox(
                  width: 32,
                  height: 32,
                  child: CircularProgressIndicator(
                      strokeWidth: 4, color: Color(0xFFF59E0B)),
                ),
              ),
            );
          }
          final roles = snap.data ?? const <RoleDef>[];
          if (snap.hasError || roles.isEmpty) {
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 48),
              child: Column(children: [
                const Text('⚠️', style: TextStyle(fontSize: 24)),
                const SizedBox(height: 8),
                Text('تعذّر تحميل الأدوار',
                    style: ar(14, color: const Color(0xFF6B7280))),
              ]),
            );
          }
          return SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            // الترتيب ثابت: مافيا ← مواطنون ← مستقلّون، والفارغ يُتخطّى
            child: Column(children: [
              for (final t in const ['MAFIA', 'CITIZEN', 'NEUTRAL'])
                if (roles.where((r) => r.team == t).isNotEmpty)
                  _section(t, roles.where((r) => r.team == t).toList()),
            ]),
          );
        },
      );

  Widget _section(String team, List<RoleDef> roles) {
    final th = _teams[team]!;
    return Padding(
      padding: const EdgeInsets.only(bottom: 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Container(
              width: 8,
              height: 24,
              decoration: BoxDecoration(
                color: th.color,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
            const SizedBox(width: 8),
            Text(th.title,
                style: ar(18, weight: FontWeight.bold, color: th.color)),
            const SizedBox(width: 8),
            Text('(${roles.length})',
                style: ar(12, color: const Color(0xFF4B5563))),
          ]),
          const SizedBox(height: 16),
          LayoutBuilder(builder: (_, cs) {
            final cols = cs.maxWidth >= 560 ? 2 : 1;
            return Wrap(
              spacing: 16,
              runSpacing: 16,
              children: [
                for (final r in roles)
                  SizedBox(
                    width: cols == 1
                        ? cs.maxWidth
                        : (cs.maxWidth - 16) / 2,
                    child: _RoleCard(role: r, theme: th),
                  ),
              ],
            );
          }),
        ],
      ),
    );
  }

  Widget _footer(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: const BoxDecoration(
          color: Color(0x801F2937),
          border: Border(top: BorderSide(color: Color(0x80374151))),
        ),
        child: Center(
          child: Material(
            borderRadius: BorderRadius.circular(12),
            child: Ink(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                gradient: const LinearGradient(
                  colors: [Color(0xFF374151), Color(0xFF4B5563)],
                ),
              ),
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: () => Navigator.of(context).maybePop(),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 32, vertical: 10),
                  child: Text('حسناً، فهمت الأدوار',
                      style: ar(14, weight: FontWeight.w500)),
                ),
              ),
            ),
          ),
        ),
      );
}

class _RoleCard extends StatelessWidget {
  const _RoleCard({required this.role, required this.theme});
  final RoleDef role;
  final _TeamTheme theme;

  @override
  Widget build(BuildContext context) {
    final win = role.winLine;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0x661F2937),
        border: Border.all(color: theme.cardBorder),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Text(_icons[role.id] ?? theme.fallbackIcon,
                style: const TextStyle(fontSize: 24)),
            const SizedBox(width: 12),
            Flexible(
              child: Text(role.nameAr.isEmpty ? role.id : role.nameAr,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ar(15,
                      weight: FontWeight.bold, color: theme.nameColor)),
            ),
            if (role.nameEn.isNotEmpty) ...[
              const SizedBox(width: 8),
              // اسمٌ لاتينيّ داخل سطرٍ عربيّ — بلا عزلٍ ينقلب ترتيبه
              Flexible(
                child: Text(role.nameEn,
                    textDirection: TextDirection.ltr,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ar(10, color: const Color(0xFF4B5563))),
              ),
            ],
          ]),
          const SizedBox(height: 8),
          Text(
              (role.description?.isNotEmpty ?? false)
                  ? role.description!
                  : 'لا يوجد وصف',
              style:
                  ar(12, color: const Color(0xFF9CA3AF), height: 1.6)),
          if (win != null) ...[
            const SizedBox(height: 8),
            Container(
              width: double.infinity,
              padding:
                  const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(8),
                color: const Color(0xFFF59E0B).withValues(alpha: 0.1),
                border: Border.all(
                    color: const Color(0xFFF59E0B).withValues(alpha: 0.15)),
              ),
              child: Text('🏆 $win',
                  style: ar(10, color: const Color(0xFFFBBF24))),
            ),
          ],
        ],
      ),
    );
  }
}
