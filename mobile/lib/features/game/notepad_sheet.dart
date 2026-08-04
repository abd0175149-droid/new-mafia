import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../models/game.dart';
import '../../models/notepad.dart';
import '../profile/profile_palette.dart';
import 'game_session_controller.dart';

// ══════════════════════════════════════════════════════
// 📝 مفكرة التحرّي — الملفّ ٢٦
// ══════════════════════════════════════════════════════
// ثلاثة تبويبات: إضافة ملاحظة · عرضها · التشاور السرّي (للمافيا وحدهم).
//
// 🔒 غطاءُ المفكرة مقصود: من يرى جاره يفتح «مفكرة» لا يعرف أنّه يتشاور
//    مع شركائه. لذلك التبويب الثالث لا يظهر إلّا لمن يملكه، ولا يوجد
//    أيّ أثرٍ بصريّ له عند غيره.

const _gold = Color(0xFFC5A059);

Future<void> showNotepad(BuildContext context, GameSessionController c) =>
    showGeneralDialog<void>(
      context: context,
      barrierDismissible: false,
      barrierLabel: 'إغلاق',
      barrierColor: Colors.transparent,
      transitionDuration: const Duration(milliseconds: 350),
      pageBuilder: (_, __, ___) => NotepadSheet(controller: c),
      transitionBuilder: (_, a, __, child) => SlideTransition(
        position: Tween(begin: const Offset(0, 1), end: Offset.zero)
            .animate(CurvedAnimation(parent: a, curve: Curves.easeOutCubic)),
        child: FadeTransition(opacity: a, child: child),
      ),
    );

class NotepadSheet extends StatefulWidget {
  const NotepadSheet({super.key, required this.controller});
  final GameSessionController controller;

  @override
  State<NotepadSheet> createState() => _NotepadSheetState();
}

enum _Tab { add, view, chat }

class _NotepadSheetState extends State<NotepadSheet> {
  GameSessionController get c => widget.controller;

  _Tab _tab = _Tab.add;
  int? _target;
  final _note = TextEditingController();
  final _chatInput = TextEditingController();
  final _chatScroll = ScrollController();
  bool _picking = false;

  @override
  void initState() {
    super.initState();
    c.addListener(_sync);
    if (c.chatVisible) unawaited(c.loadChatHistory());
  }

  @override
  void dispose() {
    c.removeListener(_sync);
    _note.dispose();
    _chatInput.dispose();
    _chatScroll.dispose();
    super.dispose();
  }

  void _sync() {
    if (!mounted) return;
    setState(() {});
    if (_tab == _Tab.chat) _scrollChatToEnd();
  }

  void _scrollChatToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_chatScroll.hasClients) return;
      _chatScroll.animateTo(
        _chatScroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    });
  }

  List<RosterPlayer> get _others =>
      c.roster.where((p) => p.physicalId != c.physicalId).toList()
        ..sort((a, b) => a.physicalId.compareTo(b.physicalId));

  String _nameOf(int pid) {
    final n = c.roster
        .where((p) => p.physicalId == pid)
        .map((p) => p.name)
        .firstOrNull;
    return (n == null || n.isEmpty) ? 'لاعب #$pid' : n;
  }

  String? _avatarOf(int pid) => null; // الروستر لا يحمل صوراً بعد

  @override
  Widget build(BuildContext context) => Directionality(
        textDirection: TextDirection.rtl,
        child: Material(
          color: const Color(0xFF080808),
          child: SafeArea(
            child: Column(children: [
              _header(),
              _tabs(),
              Expanded(
                child: Padding(
                  // 🔴 إزاحة لوحة المفاتيح: بدونها يختفي صفّ إرسال التشاور
                  //    خلفها تماماً فلا يستطيع اللاعب الكتابة — والورقة
                  //    ملء الشاشة فلا `Scaffold` يعوّض عنها.
                  padding: EdgeInsets.fromLTRB(
                      16, 0, 16, 8 + MediaQuery.viewInsetsOf(context).bottom),
                  child: switch (_tab) {
                    _Tab.add => _addTab(),
                    _Tab.view => _viewTab(),
                    _Tab.chat => _chatTab(),
                  },
                ),
              ),
            ]),
          ),
        ),
      );

  Widget _header() => Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: const BoxDecoration(
          color: Color(0xFF0D0D0D),
          border: Border(bottom: BorderSide(color: Color(0xFF1E1E1E))),
        ),
        child: Row(children: [
          const Expanded(
            child: Text('📝 مفكرة التحري',
                style: TextStyle(
                  fontFamily: 'Amiri',
                  fontSize: 19,
                  fontWeight: FontWeight.w900,
                  color: _gold,
                  letterSpacing: 0,
                )),
          ),
          InkWell(
            customBorder: const CircleBorder(),
            onTap: () => Navigator.of(context).maybePop(),
            child: Container(
              width: 32,
              height: 32,
              alignment: Alignment.center,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                color: Color(0xFF1A1A1A),
              ),
              child: const Text('✕',
                  style: TextStyle(fontSize: 16, color: Color(0xFF9CA3AF))),
            ),
          ),
        ]),
      );

  Widget _tabs() {
    final n = c.notepad.displayCount;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Row(children: [
        _tabBtn(_Tab.add, '✏️ إضافة ملاحظة'),
        const SizedBox(width: 4),
        _tabBtn(_Tab.view,
            '📋 عرض الملاحظات${c.notepad.hasAny ? ' ($n)' : ''}'),
        if (c.chatVisible) ...[
          const SizedBox(width: 4),
          _tabBtn(_Tab.chat, '🗣️ التشاور',
              badge: c.chatUnread && _tab != _Tab.chat),
        ],
      ]),
    );
  }

  Widget _tabBtn(_Tab t, String label, {bool badge = false}) {
    final on = _tab == t;
    return Expanded(
      child: Stack(clipBehavior: Clip.none, children: [
        Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () {
              setState(() => _tab = t);
              if (t == _Tab.chat) {
                c.markChatRead();
                _scrollChatToEnd();
              }
            },
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 6),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                color: on ? _gold : const Color(0xFF1A1A1A),
                border: on
                    ? null
                    : Border.all(color: const Color(0xFF2A2A2A)),
              ),
              child: Text(label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ar(12,
                      color: on ? Colors.black : const Color(0xFF9CA3AF),
                      weight: FontWeight.bold)),
            ),
          ),
        ),
        if (badge)
          const Positioned(
            top: 4,
            left: 8,
            child: _UnreadDot(),
          ),
      ]),
    );
  }

  // ══════════════════════════════════════════════════════
  // §4.4.1 إضافة ملاحظة
  // ══════════════════════════════════════════════════════
  Widget _addTab() {
    final t = _target;
    return ListView(children: [
      Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          color: const Color(0xFF111111),
          border: Border.all(color: const Color(0xFF222222)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('الملاحظة مرتبطة بـ',
                style: mono(10, color: const Color(0xFF6B7280))
                    .copyWith(letterSpacing: 1.5)),
            const SizedBox(height: 8),
            if (t == null) _noTargetBox() else _targetRow(t),
          ],
        ),
      ),
      const SizedBox(height: 12),
      Stack(children: [
        TextField(
          controller: _note,
          maxLines: 5,
          textDirection: TextDirection.rtl,
          style: ar(14, color: const Color(0xFFE5E7EB)),
          // 🔴 إعادة بناءٍ على **كلّ** حرف: حالة زرّ الحفظ مشتقّة من نصّ
          //    الحقل، فبناءٌ مشروط يُبقيه معطّلاً بعد الكتابة — يكتب
          //    اللاعب ملاحظته ثمّ لا يستطيع حفظها.
          onChanged: (v) => setState(() => _picking = v.endsWith('@')),
          decoration: InputDecoration(
            hintText: t == null
                ? 'اكتب ملاحظتك هنا... (اكتب @ لتحديد لاعب)'
                : 'ملاحظتك عن ${_nameOf(t)}...',
            hintStyle: ar(13, color: const Color(0xFF404040)),
            filled: true,
            fillColor: const Color(0xFF0D0D0D),
            contentPadding: const EdgeInsets.all(16),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: const BorderSide(color: Color(0xFF2A2A2A)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: const BorderSide(color: Color(0xFF2A2A2A)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: BorderSide(color: _gold.withValues(alpha: 0.6)),
            ),
          ),
        ),
        if (_picking)
          Positioned(left: 0, right: 0, bottom: 0, child: _picker()),
      ]),
      const SizedBox(height: 12),
      _saveButton(t),
      if (t == null && _others.isNotEmpty) ...[
        const SizedBox(height: 20),
        Text('أو اختر لاعباً مباشرة',
            style: mono(10, color: const Color(0xFF6B7280))
                .copyWith(letterSpacing: 1.5)),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final p in _others)
              InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: () => setState(() => _target = p.physicalId),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    color: const Color(0xFF1A1A1A),
                    border: Border.all(color: const Color(0xFF333333)),
                  ),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Text('#${p.physicalId}',
                        style: mono(13, color: _gold, weight: FontWeight.w900)),
                    const SizedBox(width: 6),
                    Text(p.name.isEmpty ? 'لاعب' : p.name,
                        style: ar(13,
                            color: const Color(0xFFE5E7EB),
                            weight: FontWeight.bold)),
                  ]),
                ),
              ),
          ],
        ),
      ],
    ]);
  }

  Widget _noTargetBox() => Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          color: const Color(0xFF0D0D0D),
          border: Border.all(
              color: const Color(0xFF333333), style: BorderStyle.solid),
        ),
        child: Text.rich(
          TextSpan(children: [
            const TextSpan(text: 'اكتب '),
            TextSpan(
                text: '@',
                style: mono(12, color: _gold, weight: FontWeight.bold)),
            const TextSpan(
                text: ' لاختيار لاعب — أو اترك فارغاً للملاحظات العامة'),
          ]),
          textAlign: TextAlign.center,
          style: mono(11, color: const Color(0xFF6B7280)),
        ),
      );

  Widget _targetRow(int pid) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          color: _gold.withValues(alpha: 0.1),
          border: Border.all(color: _gold.withValues(alpha: 0.3)),
        ),
        child: Row(children: [
          _avatar(pid, 36),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_nameOf(pid),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ar(13, weight: FontWeight.bold)),
                Text('مقعد #$pid', style: mono(10, color: _gold)),
              ],
            ),
          ),
          InkWell(
            onTap: () => setState(() => _target = null),
            child: const Padding(
              padding: EdgeInsets.symmetric(horizontal: 8),
              child: Text('✕',
                  style: TextStyle(color: Color(0xFF6B7280), fontSize: 14)),
            ),
          ),
        ]),
      );

  Widget _picker() => Container(
        constraints: const BoxConstraints(maxHeight: 208),
        margin: const EdgeInsets.only(bottom: 4),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          color: const Color(0xFF111111),
          border: Border.all(color: _gold.withValues(alpha: 0.4)),
          boxShadow: const [
            BoxShadow(color: Color(0x99000000), blurRadius: 20),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: _others.isEmpty
            ? Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Text('لا يوجد لاعبون مطابقون',
                    textAlign: TextAlign.center,
                    style: ar(12, color: const Color(0xFF6B7280))),
              )
            : ListView(
                shrinkWrap: true,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
                    child: Text('اختر لاعباً',
                        style: mono(9, color: _gold.withValues(alpha: 0.6))
                            .copyWith(letterSpacing: 1.5)),
                  ),
                  for (final p in _others)
                    InkWell(
                      onTap: () {
                        // «@» المكتوبة تُحذف — صارت اختياراً لا نصّاً
                        final txt = _note.text;
                        if (txt.endsWith('@')) {
                          _note.text = txt.substring(0, txt.length - 1);
                          _note.selection = TextSelection.collapsed(
                              offset: _note.text.length);
                        }
                        setState(() {
                          _target = p.physicalId;
                          _picking = false;
                        });
                      },
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 10),
                        child: Row(children: [
                          _avatar(p.physicalId, 32),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(p.name.isEmpty ? 'لاعب' : p.name,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: ar(13, weight: FontWeight.bold)),
                                Text('مقعد #${p.physicalId}',
                                    style: mono(10, color: _gold)),
                              ],
                            ),
                          ),
                        ]),
                      ),
                    ),
                ],
              ),
      );

  Widget _saveButton(int? t) {
    final empty = _note.text.trim().isEmpty;
    return Opacity(
      opacity: empty ? 0.3 : 1,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: empty
            ? null
            : () {
                final pid = t ?? Notepad.generalKey;
                final old = c.notepad.noteOf(pid);
                c.saveNote(pid, old.copyWith(text: _note.text.trim()));
                _note.clear();
                setState(() {
                  _target = null;
                  _tab = _Tab.view;
                });
              },
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 15),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            gradient: const LinearGradient(
                colors: [Color(0xFFC5A059), Color(0xFFB38B47)]),
          ),
          child: Text(
              t == null ? '💾 حفظ ملاحظة عامة' : '💾 حفظ عن ${_nameOf(t)}',
              style: const TextStyle(
                fontFamily: 'Amiri',
                fontSize: 16,
                fontWeight: FontWeight.w900,
                color: Colors.black,
                letterSpacing: 0,
              )),
        ),
      ),
    );
  }

  // ══════════════════════════════════════════════════════
  // §4.4.2 عرض الملاحظات
  // ══════════════════════════════════════════════════════
  Widget _viewTab() {
    final pad = c.notepad;
    if (!pad.hasAny) {
      return Opacity(
        opacity: 0.4,
        child: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Text('📭', style: TextStyle(fontSize: 46)),
            const SizedBox(height: 12),
            Text('لا توجد ملاحظات مسجّلة بعد',
                style: ar(14, color: const Color(0xFF9CA3AF))),
            const SizedBox(height: 4),
            Text('انتقل لتبويب "إضافة ملاحظة" للبدء',
                style: ar(12, color: const Color(0xFF6B7280))),
          ]),
        ),
      );
    }

    return ListView(children: [
      Align(
        alignment: AlignmentDirectional.centerStart,
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: _confirmClearAll,
          child: Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              color: const Color(0xFFEF4444).withValues(alpha: 0.1),
              border: Border.all(
                  color: const Color(0xFFEF4444).withValues(alpha: 0.2)),
            ),
            child: Text('🗑️ مسح كل الملاحظات',
                style: ar(12,
                    color: const Color(0xFFEF4444).withValues(alpha: 0.8),
                    weight: FontWeight.bold)),
          ),
        ),
      ),
      const SizedBox(height: 12),
      if (pad.general.text.trim().isNotEmpty) _generalCard(pad.general),
      for (final pid in pad.playersWithNotes) _playerCard(pid, pad.noteOf(pid)),
    ]);
  }

  Widget _generalCard(PlayerNote n) => Container(
        width: double.infinity,
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          color: const Color(0xFF111111),
          border: Border.all(color: const Color(0xFF2A2A2A)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Expanded(
                child: Text('📌 ملاحظات عامة',
                    style: ar(14, color: _gold, weight: FontWeight.bold)),
              ),
              InkWell(
                onTap: () => c.deleteNote(Notepad.generalKey),
                child: Text('مسح',
                    style: ar(12,
                        color:
                            const Color(0xFFEF4444).withValues(alpha: 0.6))),
              ),
            ]),
            const SizedBox(height: 8),
            Text(n.text,
                style: ar(14, color: const Color(0xFFD1D5DB), height: 1.7)),
          ],
        ),
      );

  Widget _playerCard(int pid, PlayerNote n) => Container(
        width: double.infinity,
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          color: const Color(0xFF111111),
          border: Border.all(color: const Color(0xFF2A2A2A)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              _avatar(pid, 40),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_nameOf(pid),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: ar(13, weight: FontWeight.bold)),
                    Text('مقعد #$pid', style: mono(10, color: _gold)),
                  ],
                ),
              ),
              InkWell(
                borderRadius: BorderRadius.circular(8),
                onTap: () => c.deleteNote(pid),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(8),
                    color: const Color(0xFFEF4444).withValues(alpha: 0.1),
                    border: Border.all(
                        color:
                            const Color(0xFFEF4444).withValues(alpha: 0.2)),
                  ),
                  child: Text('🗑️ حذف',
                      style: ar(11,
                          color: const Color(0xFFEF4444)
                              .withValues(alpha: 0.5))),
                ),
              ),
            ]),
            const SizedBox(height: 12),
            Row(children: [
              for (final s in const [
                Suspicion.safe,
                Suspicion.suspect,
                Suspicion.mafia
              ]) ...[
                Expanded(child: _suspicionBtn(pid, n, s)),
                if (s != Suspicion.mafia) const SizedBox(width: 6),
              ],
            ]),
            const SizedBox(height: 12),
            if (n.text.trim().isNotEmpty)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  color: const Color(0xFF0A0A0A),
                  border: Border.all(color: const Color(0xFF1E1E1E)),
                ),
                child: Text(n.text,
                    style:
                        ar(14, color: const Color(0xFFD1D5DB), height: 1.7)),
              )
            else
              Center(
                child: Text('لا يوجد نص — فقط تصنيف',
                    style: ar(12, color: const Color(0xFF404040))),
              ),
            const SizedBox(height: 8),
            InkWell(
              onTap: () => setState(() {
                _target = pid;
                _note.text = n.text;
                _tab = _Tab.add;
              }),
              child: Center(
                child: Text('+ إضافة ملاحظة',
                    style: mono(11, color: _gold.withValues(alpha: 0.6))),
              ),
            ),
          ],
        ),
      );

  Widget _suspicionBtn(int pid, PlayerNote n, Suspicion s) {
    final on = n.suspicion == s;
    final (bg, fg, border) = switch (s) {
      Suspicion.safe => (
          const Color(0xFF10B981).withValues(alpha: 0.2),
          const Color(0xFF34D399),
          const Color(0xFF10B981).withValues(alpha: 0.4),
        ),
      Suspicion.suspect => (
          const Color(0xFFEAB308).withValues(alpha: 0.2),
          const Color(0xFFFACC15),
          const Color(0xFFEAB308).withValues(alpha: 0.4),
        ),
      _ => (
          const Color(0xFFEF4444).withValues(alpha: 0.2),
          const Color(0xFFF87171),
          const Color(0xFFEF4444).withValues(alpha: 0.4),
        ),
    };

    return InkWell(
      borderRadius: BorderRadius.circular(8),
      // ضغطُ المستوى النشط يعيده إلى «غير محدّد» — لا حالة عالقة
      onTap: () => c.saveNote(
          pid, n.copyWith(suspicion: on ? Suspicion.none : s)),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 7),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          color: on ? bg : const Color(0xFF0D0D0D),
          border: Border.all(color: on ? border : const Color(0xFF1E1E1E)),
        ),
        child: Text(s.label,
            style: ar(11,
                color: on ? fg : const Color(0xFF6B7280),
                weight: FontWeight.bold)),
      ),
    );
  }

  Future<void> _confirmClearAll() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => Directionality(
        textDirection: TextDirection.rtl,
        child: AlertDialog(
          backgroundColor: const Color(0xFF111111),
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
              side: BorderSide(color: _gold.withValues(alpha: 0.3))),
          content: Text(
              'هل أنت متأكد من مسح جميع الملاحظات ومستويات الريبة لجميع اللاعبين؟',
              style: ar(14, height: 1.7)),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text('إلغاء',
                  style: ar(13, color: const Color(0xFF9CA3AF))),
            ),
            TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: Text('مسح',
                  style: ar(13,
                      color: const Color(0xFFF87171),
                      weight: FontWeight.bold)),
            ),
          ],
        ),
      ),
    );
    if (ok == true) c.clearAllNotes();
  }

  // ══════════════════════════════════════════════════════
  // §4.4.3 التشاور السرّي
  // ══════════════════════════════════════════════════════
  Widget _chatTab() {
    // 🔒 حراسةٌ مزدوجة: التبويب لا يُرسم أصلاً، وجسمُه يفحص ثانيةً —
    //    فتغيّر الأهلية أثناء الفتح (موتٌ مثلاً) يُغلق المحتوى فوراً.
    if (!c.chatVisible) return const SizedBox.shrink();

    return Column(children: [
      Expanded(
        child: c.chat.isEmpty
            ? Opacity(
                opacity: 0.4,
                child: Center(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    const Text('🤫', style: TextStyle(fontSize: 46)),
                    const SizedBox(height: 12),
                    Text('لا رسائل بعد — ابدأ التشاور',
                        style: ar(14, color: const Color(0xFF9CA3AF))),
                  ]),
                ),
              )
            : ListView.builder(
                controller: _chatScroll,
                padding: const EdgeInsets.symmetric(vertical: 8),
                itemCount: c.chat.length,
                itemBuilder: (_, i) => _bubble(c.chat[i]),
              ),
      ),
      Padding(
        padding: const EdgeInsets.only(top: 8, bottom: 4),
        child: Row(children: [
          Expanded(
            child: TextField(
              controller: _chatInput,
              textDirection: TextDirection.rtl,
              maxLength: kChatMaxLen,
              onSubmitted: (_) => _send(),
              style: ar(14),
              decoration: InputDecoration(
                counterText: '',
                hintText: 'اكتب رسالة للفريق…',
                hintStyle: ar(13, color: const Color(0xFF404040)),
                filled: true,
                fillColor: const Color(0xFF111111),
                contentPadding: const EdgeInsets.symmetric(
                    horizontal: 12, vertical: 11),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: Color(0xFF2A2A2A)),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: Color(0xFF2A2A2A)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: _gold.withValues(alpha: 0.5)),
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Opacity(
            opacity: c.chatSending ? 0.4 : 1,
            child: InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: c.chatSending ? null : _send,
              child: Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 18, vertical: 13),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  color: _gold,
                ),
                child: Text('إرسال',
                    style: ar(14,
                        color: Colors.black, weight: FontWeight.bold)),
              ),
            ),
          ),
        ]),
      ),
    ]);
  }

  Future<void> _send() async {
    final t = _chatInput.text.trim();
    if (t.isEmpty) return;
    final ok = await c.sendChat(t);
    if (ok) {
      _chatInput.clear();
      _scrollChatToEnd();
    }
  }

  Widget _bubble(MafiaChatMessage m) {
    final mine = m.physicalId == c.physicalId;
    final t = m.at;
    final hh = t.hour.toString().padLeft(2, '0');
    final mm = t.minute.toString().padLeft(2, '0');

    return Align(
      // ⚠️ اللاي‑آوت RTL: رسائلي تبدأ من حافة البداية (اليمين بصرياً)
      alignment: mine
          ? AlignmentDirectional.centerStart
          : AlignmentDirectional.centerEnd,
      child: ConstrainedBox(
        constraints: BoxConstraints(
            maxWidth: MediaQuery.sizeOf(context).width * 0.85),
        child: Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            color: mine
                ? _gold.withValues(alpha: 0.15)
                : const Color(0xFF141414),
            border: Border.all(
                color: mine
                    ? _gold.withValues(alpha: 0.3)
                    : const Color(0xFF262626)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text.rich(
                TextSpan(children: [
                  TextSpan(text: m.name.isEmpty ? 'لاعب' : m.name),
                  TextSpan(
                      text: ' (#${m.physicalId})',
                      style: mono(10,
                          color: (mine ? _gold : const Color(0xFFF87171))
                              .withValues(alpha: 0.7))),
                ]),
                style: ar(10,
                    color: mine ? _gold : const Color(0xFFF87171),
                    weight: FontWeight.bold),
              ),
              const SizedBox(height: 2),
              Text(m.text,
                  style:
                      ar(14, color: const Color(0xFFE5E7EB), height: 1.6)),
              const SizedBox(height: 2),
              // 🕐 الطابع لاتينيّ محض — يُعزل وإلّا انقلب ترتيبه
              Text('$hh:$mm',
                  textDirection: TextDirection.ltr,
                  style: mono(9, color: const Color(0xFF6B7280))),
            ],
          ),
        ),
      ),
    );
  }

  Widget _avatar(int pid, double size) {
    final url = _avatarOf(pid);
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: const Color(0xFF1A1A1A),
        border: Border.all(color: _gold.withValues(alpha: 0.4)),
      ),
      clipBehavior: Clip.antiAlias,
      child: url == null
          ? Text('#$pid',
              style: mono(size * 0.34, color: _gold, weight: FontWeight.w900))
          : CachedNetworkImage(
              imageUrl: ApiClient.instance.upload(url),
              fit: BoxFit.cover,
              errorWidget: (_, __, ___) => Text('#$pid',
                  style: mono(size * 0.34,
                      color: _gold, weight: FontWeight.w900)),
              placeholder: (_, __) =>
                  const ColoredBox(color: Color(0xFF1A1A1A)),
            ),
    );
  }
}

/// نقطة «غير مقروء» النابضة على تبويب التشاور.
class _UnreadDot extends StatefulWidget {
  const _UnreadDot();
  @override
  State<_UnreadDot> createState() => _UnreadDotState();
}

class _UnreadDotState extends State<_UnreadDot>
    with SingleTickerProviderStateMixin {
  late final _c = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 1000))
    ..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const dot = SizedBox(
      width: 8,
      height: 8,
      child: DecoratedBox(
        decoration:
            BoxDecoration(shape: BoxShape.circle, color: Color(0xFFEF4444)),
      ),
    );
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) return dot;
    return FadeTransition(
      opacity: Tween(begin: 0.4, end: 1.0)
          .animate(CurvedAnimation(parent: _c, curve: Curves.easeInOut)),
      child: dot,
    );
  }
}
