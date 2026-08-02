import 'package:flutter/material.dart';

import '../../app/config.dart';
import '../../app/theme/theme.dart';
import '../../core/api/api_client.dart';
import '../../core/api/auth_repository.dart';
import '../../core/push/push_service.dart';
import '../../core/socket/socket_service.dart';
import '../../core/storage/session_store.dart';
import '../../core/ui/atmosphere.dart';

// ══════════════════════════════════════════════════════
// 🧪 حالة النواة — مخرَج M1
// ══════════════════════════════════════════════════════
// تُثبت الطبقات الأربع على جهاز حقيقيّ: الجلسة، وREST، والسوكِت،
// والإشعارات. تُستبدل بالشل الحقيقيّ في M2 (الملفّ 11).

class CoreStatusScreen extends StatefulWidget {
  const CoreStatusScreen({super.key, required this.config, required this.onLoggedOut});

  final AppConfig config;
  final VoidCallback onLoggedOut;

  @override
  State<CoreStatusScreen> createState() => _CoreStatusScreenState();
}

class _CoreStatusScreenState extends State<CoreStatusScreen> {
  String _restResult = '—';
  bool _pushAsked = false;

  @override
  void initState() {
    super.initState();
    _probeRest();
  }

  Future<void> _probeRest() async {
    try {
      final r = await ApiClient.instance.get('/api/chips/me');
      final b = (r is Map ? r['balance'] : null) ?? 0;
      if (mounted) setState(() => _restResult = 'رصيدك $b 🪙');
    } on ApiException catch (e) {
      if (mounted) setState(() => _restResult = '✗ ${e.message}');
    }
  }

  Future<void> _askPush() async {
    setState(() => _pushAsked = true);
    final ok = await PushService.instance.requestPermissionAndRegister();
    if (mounted) setState(() => _pushAsked = ok);
  }

  Future<void> _logout() async {
    await PushService.instance.clear();
    await AuthRepository.instance.logout();
    SocketService.instance.reauth(); // يغادر غرفة اللاعب فوراً
    widget.onLoggedOut();
  }

  @override
  Widget build(BuildContext context) {
    final p = SessionStore.instance.player;
    final t = Theme.of(context).textTheme;

    return Scaffold(
      body: DisplayBg(
        child: SafeArea(
          child: ContentConstraint(
            child: ListView(
              padding: EdgeInsets.all(context.pagePadding),
              children: [
                SizedBox(height: context.sectionGap),
                Text('أهلاً ${p?.name ?? ''}', textAlign: TextAlign.center, style: t.displaySmall),
                Text('النواة جاهزة — M1', textAlign: TextAlign.center, style: t.headlineMedium),
                SizedBox(height: context.sectionGap * 1.5),

                // الرتبة ليست هنا عمداً: لا `login` ولا `/me` يحملانها —
                // تُقرأ من طبقة الملفّ الشخصيّ في M3. عرض «—» مكانها
                // يُقرأ عطلاً في المصادقة وليس كذلك.
                _Card(title: '🔐 الجلسة', rows: [
                  ('اللاعب', '#${p?.id ?? '—'}'),
                  ('الاسم', p?.name ?? '—'),
                  ('الخادم', widget.config.baseUrl.replaceFirst('https://', '')),
                ]),
                SizedBox(height: context.sectionGap),

                _Card(title: '🌐 REST', rows: [('GET /api/chips/me', _restResult)]),
                SizedBox(height: context.sectionGap),

                // السوكِت حالة حيّة — تتغيّر أمامك عند قطع الشبكة وعودتها
                ValueListenableBuilder<bool>(
                  valueListenable: SocketService.instance.connected,
                  builder: (_, on, __) => _Card(title: '🔌 السوكِت', rows: [
                    ('الحالة', on ? '✓ متّصل' : '✗ منقطع'),
                    ('الغرفة', on && p != null ? 'player:${p.id}' : '—'),
                    if (!on && SocketService.instance.lastError != null)
                      ('الخطأ', SocketService.instance.lastError!),
                  ]),
                ),
                SizedBox(height: context.sectionGap),

                _Card(title: '🔔 الإشعارات', rows: [
                  ('الإذن', _pushAsked ? '✓ مُنِح' : 'لم يُطلب بعد'),
                  ('التوكن', PushService.instance.token == null
                      ? '—'
                      : '${PushService.instance.token!.substring(0, 16)}…'),
                ]),

                SizedBox(height: context.sectionGap),
                if (!_pushAsked)
                  SizedBox(
                    height: 46,
                    child: FilledButton(onPressed: _askPush, child: const Text('فعّل الإشعارات')),
                  ),

                SizedBox(height: context.sectionGap * 2),
                SizedBox(
                  height: 44,
                  child: OutlinedButton(onPressed: _logout, child: const Text('خروج')),
                ),
                SizedBox(height: context.sectionGap * 2),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.title, required this.rows});
  final String title;
  final List<(String, String)> rows;

  @override
  Widget build(BuildContext context) => Container(
        decoration: const BoxDecoration(
          color: Noir.noirCardBg,
          border: Border.fromBorderSide(BorderSide(color: Noir.noirBorder)),
          boxShadow: NoirShadows.noirCard,
        ),
        padding: const EdgeInsets.all(4),
        child: Container(
          decoration: BoxDecoration(border: Border.all(color: MafiaScales.dark[850]!, width: 1.5)),
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              for (final (k, v) in rows)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 3),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(width: 110,
                          child: Text(k, style: Theme.of(context).textTheme.bodySmall)),
                      Expanded(
                        child: Text(v,
                            style: monoStyle(size: 12, color: Noir.citizenText),
                            textAlign: TextAlign.left),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      );
}
