import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/socket/socket_service.dart';
import '../../core/storage/session_store.dart';
import '../profile/profile_palette.dart';

// ══════════════════════════════════════════════════════
// ✉️ INV-2 — دعوة صديقٍ إلى الغرفة
// ══════════════════════════════════════════════════════
// 🔴 العلم `allowPlayerInvites` كان **مُتتبَّعاً في المتحكّم بلا أيّ واجهةٍ
//    تستهلكه**: لاعب التطبيق في غرفةٍ بعيدة لا يستطيع دعوة أحد بينما
//    زملاؤه على الويب يدعون. الخادم يقبل الدعوة منه أصلاً
//    (`room:invite-player` يفوّض الجالسَ عند تفعيل العلم).
//
// تبويبان كما الويب: المتابَعون، وبحثٌ عامّ.
// 🔴 البحث بالاسم **جزئيّاً** وبالهاتف **تامّاً**: رقمٌ جزئيّ يسمح بتخمين
//    أرقام الآخرين رقماً رقماً — قيدٌ في الخادم يُحترم هنا بلا محاولة التفافٍ.

const _gold = Color(0xFFC5A059);
const _line = Color(0xFF2A2A2A);

Future<void> showInviteSheet(BuildContext context, {required String roomId}) =>
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      // 🔴 على مُلاحِح الجذر: بلا هذا تُرسم الورقة تحت الشريط السفليّ.
      useRootNavigator: true,
      builder: (_) => _InviteSheet(roomId: roomId),
    );

class _InviteSheet extends StatefulWidget {
  const _InviteSheet({required this.roomId});
  final String roomId;

  @override
  State<_InviteSheet> createState() => _InviteSheetState();
}

class _InviteSheetState extends State<_InviteSheet> {
  final _q = TextEditingController();
  Timer? _debounce;

  bool _searching = false;
  List<_Person> _following = const [];
  List<_Person> _results = const [];
  bool _tabSearch = false;

  /// حالة كلّ دعوة: معرّف اللاعب ← 'sending' | 'sent' | رسالة خطأ.
  final Map<int, String> _status = {};

  @override
  void initState() {
    super.initState();
    unawaited(_loadFollowing());
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _q.dispose();
    super.dispose();
  }

  Future<void> _loadFollowing() async {
    final me = SessionStore.instance.player?.id;
    if (me == null) return;
    try {
      final r = await ApiClient.instance.get('/api/player-app/$me/following');
      if (!mounted) return;
      setState(() => _following = _parse(r));
    } catch (_) {
      // قائمةٌ فارغة أهون من رسالة خطأ في ورقةٍ ثانويّة — والبحث بديلٌ قائم.
    }
  }

  void _onQuery(String v) {
    _debounce?.cancel();
    final term = v.trim();
    if (term.length < 2) {
      setState(() { _results = const []; _searching = false; });
      return;
    }
    // 🔴 تأخيرٌ قبل الطلب: كلّ حرفٍ يُرسل نداءً يعني عشرة نداءاتٍ لاسمٍ واحد.
    _debounce = Timer(const Duration(milliseconds: 350), () => _search(term));
  }

  Future<void> _search(String term) async {
    setState(() => _searching = true);
    try {
      final r = await ApiClient.instance
          .get('/api/player-app/search', query: {'q': term});
      if (!mounted) return;
      setState(() { _results = _parse(r); _searching = false; });
    } catch (_) {
      if (mounted) setState(() { _results = const []; _searching = false; });
    }
  }

  List<_Person> _parse(dynamic r) {
    final list = r is Map ? (r['players'] ?? r['results'] ?? r['data']) : r;
    if (list is! List) return const [];
    final me = SessionStore.instance.player?.id;
    return list
        .whereType<Map>()
        .map((m) => _Person(
              id: (m['id'] as num?)?.toInt() ?? 0,
              name: '${m['name'] ?? ''}',
              avatarUrl: m['avatarUrl'] as String?,
            ))
        .where((p) => p.id > 0 && p.id != me) // لا دعوةَ للنفس — يرفضها الخادم
        .toList();
  }

  Future<void> _invite(_Person p) async {
    if (_status[p.id] == 'sending' || _status[p.id] == 'sent') return;
    setState(() => _status[p.id] = 'sending');
    final res = await SocketService.instance
        .ask('room:invite-player', {'roomId': widget.roomId, 'inviteePlayerId': p.id});
    if (!mounted) return;
    setState(() {
      // 🔴 `null` من `ask` يعني مهلةً أو انقطاعاً — **لا رفضاً**. عرضُه
      //    «فشل» يدفع اللاعب لإعادة الإرسال فتصل دعوتان.
      if (res == null) {
        _status[p.id] = 'تعذّر الاتصال — تحقّق من شبكتك';
      } else if (res['success'] == true) {
        _status[p.id] = 'sent';
      } else {
        _status[p.id] = '${res['error'] ?? 'تعذّرت الدعوة'}';
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final list = _tabSearch ? _results : _following;

    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.4,
      maxChildSize: 0.92,
      expand: false,
      builder: (_, scroll) => Container(
        decoration: const BoxDecoration(
          color: Color(0xFF0A0A0A),
          borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
          border: Border(top: BorderSide(color: _line)),
        ),
        child: Column(children: [
          const SizedBox(height: 10),
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: const Color(0xFF333333),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 14),
          Text('دعوة إلى الغرفة',
              style: const TextStyle(
                  fontFamily: 'Amiri',
                  fontSize: 19,
                  fontWeight: FontWeight.w900,
                  color: _gold)),
          const SizedBox(height: 12),

          // ── التبويبان ──
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(children: [
              _Tab(
                label: 'أصدقائي',
                active: !_tabSearch,
                onTap: () => setState(() => _tabSearch = false),
              ),
              const SizedBox(width: 8),
              _Tab(
                label: 'بحث',
                active: _tabSearch,
                onTap: () => setState(() => _tabSearch = true),
              ),
            ]),
          ),

          if (_tabSearch) ...[
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: TextField(
                controller: _q,
                onChanged: _onQuery,
                style: ar(14, color: Colors.white),
                decoration: InputDecoration(
                  hintText: 'اسمٌ جزئيّ أو رقم هاتفٍ كامل',
                  hintStyle: ar(12.5, color: const Color(0xFF666666)),
                  filled: true,
                  fillColor: const Color(0x66000000),
                  prefixIcon:
                      const Icon(Icons.search, size: 18, color: Color(0xFF666666)),
                  contentPadding: const EdgeInsets.symmetric(vertical: 12),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: const BorderSide(color: _line),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: const BorderSide(color: _gold),
                  ),
                ),
              ),
            ),
          ],

          const SizedBox(height: 8),
          Expanded(
            child: _searching
                ? const Center(
                    child: CircularProgressIndicator(
                        strokeWidth: 2.5, color: _gold))
                : list.isEmpty
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Text(
                            _tabSearch
                                ? (_q.text.trim().length < 2
                                    ? 'اكتب حرفين على الأقلّ'
                                    : 'لا نتائج')
                                : 'لا أصدقاء بعد — جرّب البحث',
                            textAlign: TextAlign.center,
                            style: ar(13, color: const Color(0xFF777777)),
                          ),
                        ),
                      )
                    : ListView.builder(
                        controller: scroll,
                        padding: const EdgeInsets.fromLTRB(12, 4, 12, 24),
                        itemCount: list.length,
                        itemBuilder: (_, i) => _Row(
                          person: list[i],
                          status: _status[list[i].id],
                          onInvite: () => _invite(list[i]),
                        ),
                      ),
          ),
        ]),
      ),
    );
  }
}

class _Person {
  const _Person({required this.id, required this.name, this.avatarUrl});
  final int id;
  final String name;
  final String? avatarUrl;
}

class _Tab extends StatelessWidget {
  const _Tab({required this.label, required this.active, required this.onTap});
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Expanded(
        child: GestureDetector(
          onTap: onTap,
          behavior: HitTestBehavior.opaque,
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 9),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              color: active ? const Color(0x26C5A059) : Colors.transparent,
              border: Border.all(color: active ? _gold : _line),
            ),
            child: Text(label,
                style: ar(13,
                    color: active ? _gold : const Color(0xFF888888),
                    weight: active ? FontWeight.w900 : FontWeight.w400)),
          ),
        ),
      );
}

class _Row extends StatelessWidget {
  const _Row({required this.person, required this.status, required this.onInvite});

  final _Person person;
  final String? status;
  final VoidCallback onInvite;

  @override
  Widget build(BuildContext context) {
    final sent = status == 'sent';
    final sending = status == 'sending';
    final error = status != null && !sent && !sending;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: _line),
      ),
      child: Row(children: [
        CircleAvatar(
          radius: 18,
          backgroundColor: const Color(0xFF1A1A1A),
          backgroundImage: (person.avatarUrl?.isNotEmpty ?? false)
              ? NetworkImage(ApiClient.instance.upload(person.avatarUrl!))
              : null,
          child: (person.avatarUrl?.isEmpty ?? true)
              ? const Text('🎭', style: TextStyle(fontSize: 15))
              : null,
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(person.name,
                  overflow: TextOverflow.ellipsis,
                  style: ar(13.5, color: Colors.white, weight: FontWeight.w700)),
              // 🔴 الخطأ يُعرض تحت الاسم لا في توست: الورقة تحمل عدّة دعوات،
              //    وتوستٌ واحد لا يقول أيُّها فشلت.
              if (error) ...[
                const SizedBox(height: 2),
                Text(status!,
                    style: ar(10.5, color: const Color(0xFFFCA5A5))),
              ],
            ],
          ),
        ),
        const SizedBox(width: 8),
        GestureDetector(
          onTap: sent || sending ? null : onInvite,
          behavior: HitTestBehavior.opaque,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              color: sent ? const Color(0x1A34D399) : const Color(0x14C5A059),
              border: Border.all(
                  color: sent ? const Color(0x8034D399) : const Color(0x59C5A059)),
            ),
            child: sending
                ? const SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: _gold),
                  )
                : Text(sent ? '✓ أُرسلت' : 'دعوة',
                    style: ar(12,
                        color: sent ? const Color(0xFF34D399) : _gold,
                        weight: FontWeight.w900)),
          ),
        ),
      ]),
    );
  }
}
