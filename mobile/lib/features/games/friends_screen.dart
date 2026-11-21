import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../models/activity.dart';
import '../profile/profile_palette.dart';
import 'friends_picker.dart';

// ══════════════════════════════════════════════════════
// 👥 «أصحابي» و«مجموعاتي» (خطّة التوحيد م٥ب) — نفس صفحة الويب /player/friends
//   اقتراحاتٌ ممّن لعب معك ٣ ليالٍ فأكثر في ٩٠ يوماً، ومن تتابعه، ومن حجزت لهم.
//   أرقام أصحاب الحسابات لا تُعرض، ورقم صديقٍ بلا حساب في قائمتك وحدك.
// ══════════════════════════════════════════════════════

String _ar(Object n) => n.toString().replaceAllMapped(RegExp(r'\d'), (m) => '٠١٢٣٤٥٦٧٨٩'[int.parse(m[0]!)]);
const _src = {'coplay': 'لعب معك', 'follow': 'تتابعه', 'booked': 'حجزت له', 'manual': 'أضفته', 'contact': 'من جهة اتصال'};

class FriendsScreen extends StatefulWidget {
  const FriendsScreen({super.key});
  @override
  State<FriendsScreen> createState() => _FriendsScreenState();
}

class _FriendsScreenState extends State<FriendsScreen> {
  List<Map<String, dynamic>> _friends = [], _suggest = [], _groups = [];
  bool _loaded = false, _busy = false;
  String? _err;
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _gName = TextEditingController();
  final Set<String> _sel = {};

  List<Map<String, dynamic>> _list(dynamic v) =>
      List<Map<String, dynamic>>.from((v as List? ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)));

  Future<void> _call(Future<dynamic> Function() f) async {
    setState(() { _busy = true; _err = null; });
    try {
      final r = await f();
      if (r is Map && mounted) {
        setState(() { _friends = _list(r['friends']); _suggest = _list(r['suggestions']); _groups = _list(r['groups']); _loaded = true; });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _err = e.message);
    } catch (_) {
      if (mounted) setState(() => _err = 'تعذّر الاتصال');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void initState() { super.initState(); _call(() => ApiClient.instance.get('/api/player-app/friends')); }

  @override
  void dispose() { _name.dispose(); _phone.dispose(); _gName.dispose(); super.dispose(); }

  String _nameOf(String k) =>
      ([..._friends, ..._suggest].firstWhere((f) => f['key'] == k, orElse: () => {'name': '—'})['name'] ?? '—').toString();

  Widget _row(Widget child) => Container(
        margin: const EdgeInsets.only(bottom: 6),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(12), color: const Color(0x0AFFFFFF), border: Border.all(color: const Color(0x14FFFFFF))),
        child: child,
      );

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: const Color(0xFF050505),
        appBar: AppBar(backgroundColor: Colors.black, title: Text('👥 أصحابي', style: ar(17, weight: FontWeight.bold))),
        body: !_loaded
            ? Center(child: _err != null ? Text(_err!, style: ar(13, color: const Color(0xFFFDA4AF))) : const CircularProgressIndicator())
            : ListView(padding: const EdgeInsets.all(16), children: [
                Text('احجز لأصحابك بلمسة من ورقة الحجز («مين جاي معك؟»). من له حساب يصله «تمام · مش أنا»، ومن لا حساب له يرتبط أوّل ما يحجز برقمه.',
                    style: ar(12, color: Tw.gray400)),
                if (_err != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_err!, style: ar(13, color: const Color(0xFFFDA4AF)))),
                const SizedBox(height: 14),
                Text('أصحابي ${_ar(_friends.length)}', style: ar(13, color: Tw.gray300, weight: FontWeight.bold)),
                const SizedBox(height: 8),
                if (_friends.isEmpty) Text('لا أحد بعد — أضف من الاقتراحات أو برقم.', style: ar(12, color: Tw.gray500)),
                for (final f in _friends)
                  _row(Row(children: [
                    Expanded(
                      child: GestureDetector(
                        onTap: () => setState(() => _sel.contains(f['key']) ? _sel.remove(f['key']) : _sel.add('${f['key']}')),
                        child: Text(
                          '${_sel.contains(f['key']) ? '✓ ' : ''}${f['name']} · ${f['hasAccount'] == true ? 'له حساب' : 'بلا حساب'}${f['phoneHint'] != null ? ' ${f['phoneHint']}' : ''} · ${_src[f['source']] ?? f['source']}',
                          style: ar(13, color: _sel.contains(f['key']) ? Tw.amber400 : Colors.white),
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: _busy ? null : () => _call(() => ApiClient.instance.delete('/api/player-app/friends/${f['id']}')),
                      child: Text('حذف', style: ar(11, color: Tw.gray500)),
                    ),
                  ])),
                if (_sel.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text('احفظ ${_sel.map(_nameOf).join('، ')} كمجموعة', style: ar(12, color: Tw.gray300)),
                  const SizedBox(height: 6),
                  Row(children: [
                    Expanded(child: _field(_gName, 'اسم المجموعة (مثلاً: شلّة الأحد)')),
                    const SizedBox(width: 6),
                    _plus(() async {
                      if (_gName.text.trim().isEmpty) return;
                      await _call(() => ApiClient.instance.post('/api/player-app/friends/groups', body: {'name': _gName.text.trim(), 'keys': _sel.toList()}));
                      _sel.clear(); _gName.clear();
                    }, label: 'احفظ'),
                  ]),
                ],
                if (_groups.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  Text('مجموعاتي', style: ar(13, color: Tw.gray300, weight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  for (final g in _groups)
                    _row(Row(children: [
                      Expanded(child: Text('👥 ${g['name']} · ${(g['friendIds'] as List? ?? const []).map((k) => _nameOf('$k')).join('، ')}', style: ar(13))),
                      TextButton(
                        onPressed: _busy ? null : () => _call(() => ApiClient.instance.delete('/api/player-app/friends/groups/${g['id']}')),
                        child: Text('حذف', style: ar(11, color: Tw.gray500)),
                      ),
                    ])),
                ],
                const SizedBox(height: 16),
                Text('أضف برقم', style: ar(13, color: Tw.gray300, weight: FontWeight.bold)),
                const SizedBox(height: 8),
                Row(children: [
                  Expanded(child: _field(_name, 'الاسم')),
                  const SizedBox(width: 6),
                  SizedBox(width: 130, child: _field(_phone, '07XXXXXXXX', phone: true)),
                  const SizedBox(width: 6),
                  _plus(() async {
                    await _call(() => ApiClient.instance.post('/api/player-app/friends', body: {'name': _name.text.trim(), 'phone': _phone.text.trim()}));
                    if (_err == null) { _name.clear(); _phone.clear(); }
                  }),
                ]),
                const SizedBox(height: 4),
                Text('الرقم في قائمتك وحدك، لا يُستعمل لأيّ رسالة تسويق، ويخرج منها إن ضغط صاحبه «مش أنا».', style: ar(10.5, color: Tw.gray500)),
                if (_suggest.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  Text('اقتراحات', style: ar(13, color: Tw.gray300, weight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  Wrap(spacing: 6, runSpacing: 6, children: [
                    for (final f in _suggest)
                      GestureDetector(
                        onTap: _busy ? null : () => _call(() => ApiClient.instance.post('/api/player-app/friends', body: {'playerId': f['playerId'], 'source': f['source']})),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(borderRadius: BorderRadius.circular(999), color: const Color(0x0AFFFFFF), border: Border.all(color: const Color(0x1AFFFFFF))),
                          child: Text('+ ${f['name']}${(f['nights'] ?? 0) > 0 ? ' · ${_ar(f['nights'])} ليالي معك' : ''}', style: ar(12, color: Tw.gray300)),
                        ),
                      ),
                  ]),
                ],
              ]),
      ),
    );
  }

  Widget _plus(VoidCallback onTap, {String label = '+'}) => GestureDetector(
        onTap: _busy ? null : onTap,
        child: Container(
          height: 40, padding: const EdgeInsets.symmetric(horizontal: 14), alignment: Alignment.center,
          decoration: BoxDecoration(color: Tw.amber400, borderRadius: BorderRadius.circular(10)),
          child: Text(label, style: ar(14, color: Colors.black, weight: FontWeight.bold)),
        ),
      );

  Widget _field(TextEditingController c, String hint, {bool phone = false}) => TextField(
        controller: c,
        keyboardType: phone ? TextInputType.phone : TextInputType.text,
        textDirection: phone ? TextDirection.ltr : null,
        style: ar(13),
        decoration: InputDecoration(
          isDense: true, hintText: hint, hintStyle: ar(12, color: Tw.gray500),
          filled: true, fillColor: const Color(0x0DFFFFFF),
          contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Color(0x1AFFFFFF))),
        ),
      );
}

/// 👥 أضف أصحاباً لحجزٍ قائم — ورقةٌ فيها «مين جاي معك؟» وزرّ الإضافة
Future<void> showAddFriendsSheet(BuildContext context, Activity a) async {
  final sel = FriendsSelection();
  var busy = false;
  await showModalBottomSheet<void>(
    context: context,
    useRootNavigator: true,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    barrierColor: const Color(0xE6000000),
    builder: (ctx) => StatefulBuilder(builder: (ctx, setS) {
      return Container(
        padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.viewInsetsOf(ctx).bottom + MediaQuery.viewPaddingOf(ctx).bottom),
        decoration: const BoxDecoration(color: Color(0xFF111827), borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
        child: SingleChildScrollView(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
            Center(child: Text('أضف أصحاباً لحجزك', style: ar(17, weight: FontWeight.bold))),
            const SizedBox(height: 4),
            Center(child: Text(a.name, style: ar(13, color: Tw.gray400))),
            FriendsPicker(activity: a, selection: sel, onChanged: () => setS(() {})),
            const SizedBox(height: 14),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: Tw.amber400, foregroundColor: Colors.black, padding: const EdgeInsets.symmetric(vertical: 14)),
              onPressed: sel.isEmpty || busy
                  ? null
                  : () async {
                      setS(() => busy = true);
                      try {
                        final r = await ApiClient.instance.post('/api/player-app/book/${a.id}/friends', body: sel.toJson());
                        if (!ctx.mounted) return;
                        Navigator.of(ctx).pop();
                        if (r is Map && r['joinCode'] != null && context.mounted) {
                          await showJoinMessage(context, '🎭 حجزتلك مقعد معي في «${a.name}».\nلتثبّت مقعدك باسمك ابعت للدون على واتساب:\nانضمام ${r['joinCode']}');
                        } else if (r is Map && r['text'] != null && context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${r['text']}'.split('\n').first)));
                        }
                      } on ApiException catch (e) {
                        if (ctx.mounted) ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(content: Text(e.message)));
                        setS(() => busy = false);
                      } catch (_) {
                        setS(() => busy = false);
                      }
                    },
              child: Text('أضفهم لحجزي', style: ar(15, color: Colors.black, weight: FontWeight.bold)),
            ),
          ]),
        ),
      );
    }),
  );
}
