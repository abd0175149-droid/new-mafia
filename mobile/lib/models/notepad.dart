import 'dart:convert';

// ══════════════════════════════════════════════════════
// 📝 مفكرة التحرّي ودردشة المافيا — الملفّ ٢٦
// ══════════════════════════════════════════════════════
// 🔒 المفكرة **محلّيةٌ بحتة**: لا تُرسل إلى الخادم ولا تُشارَك. ملاحظات
//    لاعبٍ عن جيرانه هي جوهر لعبه، وأيّ تسرّبٍ لها يهدم الجولة.
//    والدردشة عكسُها تماماً: تمرّ بالخادم الذي يتحقّق من كلّ رسالة.

enum Suspicion { none, safe, suspect, mafia }

extension SuspicionX on Suspicion {
  String get id => switch (this) {
        Suspicion.none => 'none',
        Suspicion.safe => 'safe',
        Suspicion.suspect => 'suspect',
        Suspicion.mafia => 'mafia',
      };

  String get label => switch (this) {
        Suspicion.none => '⚪ غير محدد',
        Suspicion.safe => '🟢 بريء',
        Suspicion.suspect => '🟡 مشتبه',
        Suspicion.mafia => '🔴 مافيا',
      };

  /// الإيموجي وحده — يُرسم بجانب اسم المرشّح في بطاقة الاقتراع.
  String? get emoji => switch (this) {
        Suspicion.none => null,
        Suspicion.safe => '🟢',
        Suspicion.suspect => '🟡',
        Suspicion.mafia => '🔴',
      };

  static Suspicion parse(Object? v) => switch ('$v') {
        'safe' => Suspicion.safe,
        'suspect' => Suspicion.suspect,
        'mafia' => Suspicion.mafia,
        _ => Suspicion.none,
      };
}

class PlayerNote {
  const PlayerNote({this.text = '', this.suspicion = Suspicion.none});

  final String text;
  final Suspicion suspicion;

  bool get isEmpty => text.trim().isEmpty && suspicion == Suspicion.none;

  PlayerNote copyWith({String? text, Suspicion? suspicion}) =>
      PlayerNote(text: text ?? this.text, suspicion: suspicion ?? this.suspicion);

  Map<String, dynamic> toJson() => {'text': text, 'suspicion': suspicion.id};

  static PlayerNote fromJson(Object? v) => v is! Map
      ? const PlayerNote()
      : PlayerNote(
          text: '${v['text'] ?? ''}',
          suspicion: SuspicionX.parse(v['suspicion']),
        );
}

/// خريطة `physicalId → ملاحظة`. المفتاح **صفر** للملاحظة العامّة.
class Notepad {
  const Notepad({this.notes = const {}});

  final Map<int, PlayerNote> notes;

  static const generalKey = 0;

  PlayerNote noteOf(int pid) => notes[pid] ?? const PlayerNote();
  PlayerNote get general => noteOf(generalKey);

  /// اللاعبون ذوو ملاحظةٍ أو تصنيف — مرتّبين بالمقعد. العامّة ليست منهم.
  List<int> get playersWithNotes => (notes.entries
          .where((e) => e.key != generalKey && !e.value.isEmpty)
          .map((e) => e.key)
          .toList()
        ..sort())
      .toList(growable: false);

  bool get hasAny =>
      playersWithNotes.isNotEmpty || general.text.trim().isNotEmpty;

  /// عدّاد التبويب: اللاعبون + الملاحظة العامّة إن كان لها نصّ.
  int get displayCount =>
      playersWithNotes.length + (general.text.trim().isNotEmpty ? 1 : 0);

  Notepad withNote(int pid, PlayerNote n) {
    final m = Map<int, PlayerNote>.from(notes);
    if (n.isEmpty) {
      m.remove(pid);
    } else {
      m[pid] = n;
    }
    return Notepad(notes: m);
  }

  Notepad without(int pid) {
    final m = Map<int, PlayerNote>.from(notes)..remove(pid);
    return Notepad(notes: m);
  }

  String encode() => jsonEncode({
        for (final e in notes.entries) '${e.key}': e.value.toJson(),
      });

  static Notepad decode(String? raw) {
    if (raw == null || raw.isEmpty) return const Notepad();
    try {
      final j = jsonDecode(raw);
      if (j is! Map) return const Notepad();
      final out = <int, PlayerNote>{};
      j.forEach((k, v) {
        final id = int.tryParse('$k');
        if (id == null) return;
        final n = PlayerNote.fromJson(v);
        if (!n.isEmpty) out[id] = n;
      });
      return Notepad(notes: out);
    } catch (_) {
      // مفكرةٌ تالفة لا تُسقط الشاشة — تُبدأ من جديد
      return const Notepad();
    }
  }
}

// ══════════════════════════════════════════════════════
// 🗣️ رسالة التشاور
// ══════════════════════════════════════════════════════
class MafiaChatMessage {
  const MafiaChatMessage({
    required this.physicalId,
    this.name = '',
    this.text = '',
    this.atMs = 0,
  });

  final int physicalId;
  final String name, text;
  final int atMs;

  /// الوقت **محلّيّ**: الخادم يخزّن UTC كما هو معتادٌ في المنصّة.
  DateTime get at => DateTime.fromMillisecondsSinceEpoch(atMs).toLocal();

  static MafiaChatMessage? fromJson(Object? v) {
    if (v is! Map) return null;
    final id = v['physicalId'];
    if (id is! num) return null;
    return MafiaChatMessage(
      physicalId: id.toInt(),
      name: '${v['name'] ?? ''}',
      text: '${v['text'] ?? ''}',
      atMs: (v['at'] as num?)?.toInt() ?? 0,
    );
  }

  static List<MafiaChatMessage> listOf(Object? v) => v is! List
      ? const []
      : v
          .map(MafiaChatMessage.fromJson)
          .whereType<MafiaChatMessage>()
          .toList(growable: false);
}

/// سقفٌ صلبٌ على العميل — الخادم يفرضه أيضاً.
const kChatMaxLen = 300;
