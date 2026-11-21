import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../models/activity.dart';
import '../profile/profile_palette.dart';
import 'friends_screen.dart';

// ══════════════════════════════════════════════════════
// 👥 «مين جاي معك؟» — الحجز للأصحاب من قائمة محفوظة (خطّة التوحيد م٥ب · م٧)
//   نفس واجهة الويب: مجموعاتي ⟵ أصحابي ⟵ اقتراحاتٌ ممّن لعب معك ⟵ صديقٌ جديد ⟵ مرافقٌ بلا اسم.
//   السعر والعرض من الخادم (/book/preview) قبل الضغط — لا يحسب التطبيق سعراً بنفسه.
// ══════════════════════════════════════════════════════

class FriendsSelection {
  FriendsSelection();
  final List<String> keys = [];
  final List<Map<String, String>> newFriends = [];
  int companions = 0;
  String payer = 'each';
  bool get isEmpty => keys.isEmpty && newFriends.isEmpty && companions == 0;
  int get count => keys.length + newFriends.length + companions;
  Map<String, dynamic> toJson() => {
        if (keys.isNotEmpty) 'keys': keys,
        if (newFriends.isNotEmpty) 'newFriends': newFriends,
        if (companions > 0) 'companions': companions,
        'payer': payer,
      };
}

String _ar(Object n) => n.toString().replaceAllMapped(RegExp(r'\d'), (m) => '٠١٢٣٤٥٦٧٨٩'[int.parse(m[0]!)]);

class FriendsPicker extends StatefulWidget {
  const FriendsPicker({super.key, required this.activity, required this.selection, this.onChanged});
  final Activity activity;
  final FriendsSelection selection;
  final VoidCallback? onChanged;
  @override
  State<FriendsPicker> createState() => _FriendsPickerState();
}

class _FriendsPickerState extends State<FriendsPicker> {
  bool _open = false;
  List<Map<String, dynamic>> _friends = [], _suggest = [], _groups = [];
  bool _loaded = false;
  Map<String, dynamic>? _preview;
  Timer? _debounce;
  final _name = TextEditingController();
  final _phone = TextEditingController();

  FriendsSelection get s => widget.selection;

  Future<void> _load() async {
    try {
      final r = await ApiClient.instance.get('/api/player-app/friends');
      if (r is Map && mounted) {
        setState(() {
          _friends = List<Map<String, dynamic>>.from((r['friends'] as List? ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)));
          _suggest = List<Map<String, dynamic>>.from((r['suggestions'] as List? ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)));
          _groups = List<Map<String, dynamic>>.from((r['groups'] as List? ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)));
          _loaded = true;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loaded = true);
    }
  }

  void _changed() {
    widget.onChanged?.call();
    setState(() {});
    _debounce?.cancel();
    if (s.isEmpty) { setState(() => _preview = null); return; }
    _debounce = Timer(const Duration(milliseconds: 350), () async {
      try {
        final r = await ApiClient.instance.post('/api/player-app/book/preview', body: {'activityId': widget.activity.id, ...s.toJson()});
        if (mounted && r is Map) setState(() => _preview = Map<String, dynamic>.from(r));
      } on ApiException catch (e) {
        if (mounted) setState(() => _preview = {'error': e.message});
      } catch (_) {}
    });
  }

  @override
  void dispose() { _debounce?.cancel(); _name.dispose(); _phone.dispose(); super.dispose(); }

  Widget _chip(String label, bool on, VoidCallback tap) => GestureDetector(
        onTap: tap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            color: on ? const Color(0x29FBBF24) : const Color(0x0AFFFFFF),
            border: Border.all(color: on ? const Color(0x8CFBBF24) : const Color(0x1AFFFFFF)),
          ),
          child: Text(label, style: ar(12, color: on ? Tw.amber400 : Tw.gray300)),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final go = widget.activity.groupOffer;
    final all = [..._friends, ..._suggest];
    return Container(
      margin: const EdgeInsets.only(top: 12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: const Color(0x08FFFFFF),
        border: Border.all(color: const Color(0x14FFFFFF)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        InkWell(
          onTap: () { setState(() => _open = !_open); if (!_loaded) _load(); },
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(children: [
              Expanded(child: Text('👥 مين جاي معك؟${s.count > 0 ? ' · ${_ar(s.count)}' : ''}', style: ar(13, weight: FontWeight.bold))),
              Text(_open ? 'إخفاء' : (s.count > 0 ? 'تعديل' : 'أضف أصحابك'), style: ar(11, color: Tw.gray400)),
            ]),
          ),
        ),
        if (go != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
            child: Text('🎁 عرض «${go.name}»: ${go.rule} — أضف أصحابك لتأخذه', style: ar(11.5, color: Tw.amber400)),
          ),
        if (_open)
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
            child: !_loaded
                ? Text('يُحمَّل…', style: ar(12, color: Tw.gray500))
                : Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    GestureDetector(
                      onTap: () async {
                        await Navigator.of(context, rootNavigator: true).push(MaterialPageRoute(builder: (_) => const FriendsScreen()));
                        _loaded = false; await _load();
                      },
                      child: Padding(padding: const EdgeInsets.only(bottom: 8), child: Text('إدارة أصحابي ومجموعاتي ←', style: ar(11, color: Tw.amber400))),
                    ),
                    if (_groups.isNotEmpty) ...[
                      Text('مجموعاتي', style: ar(11, color: Tw.gray500)),
                      const SizedBox(height: 6),
                      Wrap(spacing: 6, runSpacing: 6, children: [
                        for (final g in _groups)
                          _chip('👥 ${g['name']}', false, () {
                            for (final k in (g['friendIds'] as List? ?? const [])) {
                              if (!s.keys.contains('$k')) s.keys.add('$k');
                            }
                            _changed();
                          }),
                      ]),
                      const SizedBox(height: 10),
                    ],
                    if (all.isNotEmpty) ...[
                      Text('أصحابي ومن لعب معك', style: ar(11, color: Tw.gray500)),
                      const SizedBox(height: 6),
                      Wrap(spacing: 6, runSpacing: 6, children: [
                        for (final f in all)
                          _chip(
                            '${s.keys.contains(f['key']) ? '✓ ' : ''}${f['name']}${f['saved'] != true && (f['nights'] ?? 0) > 0 ? ' · ${_ar(f['nights'])} ليالي' : ''}',
                            s.keys.contains(f['key']),
                            () { final k = '${f['key']}'; s.keys.contains(k) ? s.keys.remove(k) : s.keys.add(k); _changed(); },
                          ),
                      ]),
                      const SizedBox(height: 10),
                    ],
                    if (s.newFriends.isNotEmpty)
                      Wrap(spacing: 6, runSpacing: 6, children: [
                        for (var i = 0; i < s.newFriends.length; i++)
                          _chip('✓ ${s.newFriends[i]['name']} ✕', true, () { s.newFriends.removeAt(i); _changed(); }),
                      ]),
                    const SizedBox(height: 8),
                    Text('صديقٌ جديد', style: ar(11, color: Tw.gray500)),
                    const SizedBox(height: 6),
                    Row(children: [
                      Expanded(child: _field(_name, 'الاسم')),
                      const SizedBox(width: 6),
                      SizedBox(width: 130, child: _field(_phone, '07XXXXXXXX', phone: true)),
                      const SizedBox(width: 6),
                      GestureDetector(
                        onTap: () {
                          final n = _name.text.trim(); final p = _phone.text.replaceAll(RegExp(r'[^\d+]'), '');
                          if (n.length < 2 || p.length < 9) return;
                          s.newFriends.add({'name': n, 'phone': p}); _name.clear(); _phone.clear(); _changed();
                        },
                        child: Container(width: 40, height: 40, alignment: Alignment.center,
                            decoration: BoxDecoration(color: Tw.amber400, borderRadius: BorderRadius.circular(10)),
                            child: Text('+', style: ar(18, color: Colors.black, weight: FontWeight.bold))),
                      ),
                    ]),
                    const SizedBox(height: 4),
                    Text('يُحفظ في قائمتك وحدك ولا يُستعمل لأيّ رسالة تسويق.', style: ar(10.5, color: Tw.gray500)),
                    const SizedBox(height: 10),
                    Row(children: [
                      Expanded(child: Text('مرافقون بلا اسم (يأخذون مقاعدهم برمز انضمام)', style: ar(12, color: Tw.gray300))),
                      IconButton(onPressed: () { if (s.companions > 0) { s.companions--; _changed(); } }, icon: const Icon(Icons.remove_circle_outline, color: Colors.white70)),
                      Text(_ar(s.companions), style: ar(14, color: Tw.amber400, weight: FontWeight.bold)),
                      IconButton(onPressed: () { if (s.companions < 10) { s.companions++; _changed(); } }, icon: const Icon(Icons.add_circle_outline, color: Colors.white70)),
                    ]),
                    if (s.count > 0)
                      Row(children: [
                        for (final p in const ['each', 'owner'])
                          Expanded(
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 3),
                              child: _chip(p == 'each' ? 'كلّ واحد عن نفسه' : 'أنا بدفع عن الكلّ', s.payer == p, () { s.payer = p; _changed(); }),
                            ),
                          ),
                      ]),
                  ]),
          ),
        if (_preview != null) _previewBox(_preview!),
      ]),
    );
  }

  Widget _field(TextEditingController c, String hint, {bool phone = false}) => TextField(
        controller: c,
        keyboardType: phone ? TextInputType.phone : TextInputType.name,
        textDirection: phone ? TextDirection.ltr : null,
        style: ar(13),
        decoration: InputDecoration(
          isDense: true, hintText: hint, hintStyle: ar(12, color: Tw.gray500),
          filled: true, fillColor: const Color(0x0DFFFFFF),
          contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Color(0x1AFFFFFF))),
        ),
      );

  Widget _previewBox(Map<String, dynamic> p) {
    if (p['error'] != null) {
      return Padding(padding: const EdgeInsets.all(12), child: Text('${p['error']}', style: ar(12, color: const Color(0xFFFDA4AF))));
    }
    final offer = p['offer'] as Map?; final nudge = p['nudge'] as Map?; final hint = p['nameHint'] as Map?;
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(10), color: const Color(0x12FBBF24), border: Border.all(color: const Color(0x40FBBF24))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(child: Text('${_ar(p['people'] ?? 1)} أشخاص', style: ar(12, color: Tw.gray300))),
          Text('${_ar(p['total'] ?? 0)} د.أ', style: ar(13, color: Tw.amber400, weight: FontWeight.bold)),
        ]),
        if (offer != null) Text('🎁 عرض «${offer['name']}»: ${_ar(offer['free'])} ببلاش — على الحضور الفعليّ', style: ar(11.5, color: kEmeraldTextLocal)),
        if (offer == null && nudge != null) Text('💡 أضف ${_ar(nudge['need'])} ويصير ${_ar(nudge['free'])} منكم ببلاش', style: ar(11.5, color: Tw.amber400)),
        if (hint != null) Text('💡 سمِّ مرافقيك ليأخذوا عرض «${hint['name']}»', style: ar(11.5, color: Tw.amber400)),
      ]),
    );
  }
}

const kEmeraldTextLocal = Color(0xFF6EE7B7);

/// 🎟️ رسالة رمز الانضمام للمشاركة — واتساب أو نسخ
Future<void> showJoinMessage(BuildContext context, String message) {
  return showDialog(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: Tw.gray900,
      title: Text('حوّل هالرسالة لمرافقيك', style: ar(15, color: Tw.amber400, weight: FontWeight.bold)),
      content: Text('$message\n\nكلّ واحد بيبعت الرمز من رقمه بياخد مقعده باسمه.', style: ar(13, color: Tw.gray300)),
      actions: [
        TextButton(
          onPressed: () async {
            await Clipboard.setData(ClipboardData(text: message));
            if (ctx.mounted) Navigator.of(ctx).pop();
          },
          child: Text('نسخ', style: ar(14, color: Tw.gray300)),
        ),
        TextButton(
          onPressed: () async {
            final uri = Uri.parse('https://api.whatsapp.com/send?text=${Uri.encodeComponent(message)}');
            await launchUrl(uri, mode: LaunchMode.externalApplication);
            if (ctx.mounted) Navigator.of(ctx).pop();
          },
          child: Text('شارك على واتساب', style: ar(14, color: Tw.amber400)),
        ),
      ],
    ),
  );
}
