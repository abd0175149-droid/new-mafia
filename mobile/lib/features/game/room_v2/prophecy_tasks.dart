// ══════════════════════════════════════════════════════
// 🔮 موسم النبوءة داخل «الظرف» (مهامّي) — نقلٌ لـ ProphecyTasks.tsx في الويب
//
// القاعدة المقفلة: الشاشة واحدةٌ لكلّ الأدوار، وما يخصّ الدور داخل الظرف وحده. يُرسم هنا:
//   العرّاف   الصندوقان «أ» و«ب» ليلاً، وما رآه، و«حقّ الشكّ» قبل التصويت
//   المُضلّل  أقنعته، وخبر احتراقها دون من قرأها
//   القارئة  صدقها وعتبتها، والفنجان المكشوف مرّةً، وختم قدر الغد بعد رحيلها
//   المنقسم  الاختيار في الليلة الثانية بتأكيد — نهائيّ
//   الكفيل   تذكير: يقف ويقول «أكفله» بعد الفرز، والموجّه يسجّلها
// الحالة من room:get-my-state عند الفتح (لكلّ الأدوار — فالنداء نفسه لا يميّز أحداً)،
// والأفعال بمقعد المقبس (الخادم يتحقّق). لا اهتزاز لفعلٍ يخصّ دوراً.
// ══════════════════════════════════════════════════════
import 'package:flutter/material.dart';
import '../game_session_controller.dart';

const _gold = Color(0xFFC5A059);
const _ink2 = Color(0xFFD8CFBF);
TextStyle _t(double s, {Color color = _ink2, FontWeight weight = FontWeight.normal}) =>
    TextStyle(fontFamily: 'Tajawal', fontSize: s, color: color, fontWeight: weight, height: 1.5);

const _outcome = {
  'TRUE': 'صدقت نبوءتك', 'FALSE': 'كذبت نبوءتك', 'WITHDRAWN': 'أحرقتها بحقّ الشكّ', 'VETOED': 'نقضها العمدة',
  'GUARANTEED': 'كفل الكفيلُ صاحبها', 'BURNED_NIGHT': 'احترقت ليلاً', 'REMOVED': 'أُزيلت', 'NOT_PASSED': 'لم تمرّ',
};

class ProphecyTasksV2 extends StatefulWidget {
  const ProphecyTasksV2({super.key, required this.controller});
  final GameSessionController controller;
  @override
  State<ProphecyTasksV2> createState() => _ProphecyTasksV2State();
}

class _ProphecyTasksV2State extends State<ProphecyTasksV2> {
  Map<String, dynamic>? _st;
  bool _busy = false;
  String _msg = '';
  String? _confirm;
  int? _sealPick;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final r = await widget.controller.prophecyState();
    if (!mounted || r == null || r['success'] == false) return;
    setState(() => _st = r);
  }

  Future<void> _act(String ev, Map<String, dynamic> data, String ok) async {
    if (_busy) return;
    setState(() { _busy = true; _msg = ''; });
    final r = await widget.controller.prophecySend(ev, data);
    if (!mounted) return;
    setState(() { _busy = false; _msg = r?['success'] == true ? ok : '${r?['error'] ?? 'لم يُقبل — حاول ثانيةً'}'; });
    await _load();
  }

  Widget _blk(String h, List<Widget> kids) => Container(
        margin: const EdgeInsets.only(top: 10),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: const Color(0xFF111111), border: Border.all(color: const Color(0x26FFFFFF)), borderRadius: BorderRadius.circular(3)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [Text(h, style: _t(12.5, color: _gold, weight: FontWeight.bold)), const SizedBox(height: 4), ...kids]),
      );

  Widget _btn(String label, VoidCallback? onTap, {bool on = false, bool danger = false}) => Padding(
        padding: const EdgeInsets.all(3),
        child: OutlinedButton(
          onPressed: _busy ? null : onTap,
          style: OutlinedButton.styleFrom(
            minimumSize: const Size(0, 44),
            backgroundColor: on ? _gold.withValues(alpha: 0.15) : danger ? const Color(0x1AD9636A) : Colors.black26,
            side: BorderSide(color: on ? _gold : danger ? const Color(0x99D9636A) : const Color(0xFF2A241C)),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          ),
          child: Text(label, textAlign: TextAlign.center, style: _t(13.5, color: on ? _gold : danger ? const Color(0xFFF2A6A9) : Colors.white, weight: FontWeight.bold)),
        ),
      );

  Widget _row(List<Widget> kids) => Row(children: [for (final k in kids) Expanded(child: k)]);

  String _name(dynamic seat) {
    for (final p in widget.controller.roster) {
      if (p.physicalId == (seat is int ? seat : int.tryParse('$seat'))) return p.name;
    }
    return '';
  }

  @override
  Widget build(BuildContext context) {
    final st = _st;
    if (st == null) return const SizedBox.shrink();
    final o = st['oracleNotice'] as Map?, d = st['deceiverNotice'] as Map?, c = st['cupNotice'] as Map?;
    final dv = st['dividedNotice'] as Map?, g = st['guarantorNotice'] as Map?;
    if (o == null && d == null && c == null && dv == null && g == null) return const SizedBox.shrink();
    final night = widget.controller.gamePhase == 'NIGHT';
    final seat = widget.controller.mySeat;
    String box(dynamic b) => b == 'B' ? 'ب' : 'أ';

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (o != null)
        _blk('📜 النبوءة', [
          if (o['used'] != true && o['canOpenTonight'] == true) ...[
            Text('صندوقان الليلة: في أحدهما مافيا وفي الآخر بريء. اختر واحداً — ترى الاسم صباحاً، ويصير صفقةً أولى في النهار بلا اسمك.', style: _t(13)),
            _row([
              _btn('الصندوق «أ»', () => _act('oracle:open', {'box': 'A'}, 'اخترت الصندوق «أ»'), on: o['pendingBox'] == 'A'),
              _btn('الصندوق «ب»', () => _act('oracle:open', {'box': 'B'}, 'اخترت الصندوق «ب»'), on: o['pendingBox'] == 'B'),
              _btn('لا الليلة', () => _act('oracle:open', {'box': null}, 'لا الليلة'), on: o['pendingBox'] == null),
            ]),
          ],
          if (o['used'] != true && o['canOpenTonight'] != true) Text('نبوءتك مرّةً في اللعبة — تُفتح من الليلة الثانية.', style: _t(13)),
          if (o['used'] == true && o['seenPhysicalId'] != null) Text('فتحت الصندوق «${box(o['chosenBox'])}»: #${o['seenPhysicalId']} ${o['seenName'] ?? ''}', style: _t(13.5, color: Colors.white)),
          if (o['outcome'] != null) Text(_outcome['${o['outcome']}'] ?? '${o['outcome']}', style: _t(13)),
          if (o['canWithdraw'] == true) ...[
            Text('حقّ الشكّ: إن شككت في نبوءتك فاحرقها قبل أن يُفتح التصويت.', style: _t(13)),
            _btn('احرق نبوءتي', () => _act('oracle:withdraw', {}, 'أُحرقت نبوءتك'), danger: true),
          ],
        ]),
      if (d != null)
        _blk('🎭 القناع', [
          Text((d['masksLeft'] ?? 0) > 0 ? 'بقي لك ${d['masksLeft'] == 2 ? 'قناعان' : 'قناعٌ واحد'} — تضعه من اختيار الليل على من ليس مافيا.' : 'وضعت أقنعتك.', style: _t(13)),
          for (final m in (d['masks'] as List? ?? const []).whereType<Map>())
            Text('#${m['targetPhysicalId']} ${_name(m['targetPhysicalId'])} — ${m['burned'] == true ? 'احترق' : 'قائم'}', style: _t(13)),
          if (d['maskBurnedRound'] != null) Text('⚠️ احترق قناعك — قرأه أحدهم، ولا تعرف من.', style: _t(13, color: const Color(0xFFF2A6A9))),
        ]),
      if (c != null)
        _blk('☕ الفنجان', [
          Text('صدقت ${c['hits'] ?? 0} من ${c['threshold'] ?? 0}.', style: _t(13)),
          if (c['departed'] != true && night && c['publicUsed'] != true) ...[
            Text('الفنجان المكشوف مرّةً في اللعبة: قراءة الليلة تظهر صباحاً على الشاشة بلا اسمك.', style: _t(13)),
            _row([
              _btn('خفيّة', () => _act('cup:public', {'on': false}, 'قراءةٌ خفيّة'), on: c['pendingPublic'] != true),
              _btn('🫖 اكشفها', () => _act('cup:public', {'on': true}, 'الفنجان مكشوفٌ الليلة'), on: c['pendingPublic'] == true),
            ]),
          ],
          if (c['departed'] == true) Text('رحلتِ فائزة.', style: _t(13, color: _gold)),
          if (c['canSealTonight'] == true) ...[
            Text('قدر الغد: اختمي اسماً — يُعدم أوّل النهار بلا تصويت.', style: _t(13)),
            Wrap(children: [
              for (final p in widget.controller.roster.where((p) => p.isAlive && p.physicalId != seat))
                SizedBox(width: 64, child: _btn('${p.physicalId}', () => setState(() => _sealPick = p.physicalId), on: _sealPick == p.physicalId || c['sealPhysicalId'] == p.physicalId)),
            ]),
            if (_sealPick != null && _sealPick != c['sealPhysicalId'])
              _btn('أكّدي ختم #$_sealPick ${_name(_sealPick)}', () => _act('cup:seal', {'target': _sealPick}, 'خُتم #$_sealPick'), danger: true),
          ],
        ]),
      if (dv != null)
        _blk('⚖️ الانقسام', [
          if (dv['canChooseNow'] == true) ...[
            Text('الليلة تختار، والاختيار نهائيّ: تعبر إلى المافيا فتعرفهم ويعرفونك وتشارك اغتيال الليلة، أو تبقى مع المدينة لا تعرف أحداً.', style: _t(13)),
            if (_confirm == null)
              _row([
                _btn('أعبر إلى المافيا', () => setState(() => _confirm = 'MAFIA')),
                _btn('أبقى مع المدينة', () => setState(() => _confirm = 'CITY')),
              ])
            else
              _row([
                _btn('أكّد: ${_confirm == 'MAFIA' ? 'المافيا' : 'المدينة'}', () => _act('divided:choose', {'side': _confirm}, _confirm == 'MAFIA' ? 'عبرت إلى المافيا' : 'بقيت مع المدينة'), danger: true),
                _btn('تراجع', () => setState(() => _confirm = null)),
              ]),
          ] else if (dv['choice'] != null)
            Text(dv['choice'] == 'MAFIA' ? 'عبرتَ إلى المافيا.' : dv['defaulted'] == true ? 'لم تختر — بقيت مع المدينة.' : 'اخترتَ المدينة.', style: _t(13))
          else
            Text('تختار جانبك في الليلة الثانية — حتّى ذلك أنت مع المدينة.', style: _t(13)),
        ]),
      if (g != null)
        _blk('🤝 الكفالة', [
          Text(g['used'] == true
              ? (g['outcome'] == 'SAVED' ? 'كفلتَ بريئاً فنجا.' : 'استُعملت كفالتك.')
              : 'مرّةً في اللعبة: بعد فرز التصويت وقبل الإعدام قف وقل «أكفله». إن كان بريئاً نجا، وإن لم يكن متَّ معه.', style: _t(13)),
        ]),
      if (_msg.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_msg, textAlign: TextAlign.center, style: _t(13, color: _gold))),
    ]);
  }
}
