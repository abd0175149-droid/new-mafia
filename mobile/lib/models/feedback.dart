import 'package:flutter/material.dart';

// ══════════════════════════════════════════════════════
// 📋 نماذج التقييم الإلزاميّ — §8 في الملفّ 18
// ══════════════════════════════════════════════════════
// 🔴 الأسئلة **من الخادم** (`questions` في استجابة الاستبيان). تكويد
//    الأحد عشر سؤالاً هنا يعني نصّين ينحرف أحدهما عن الآخر بلا إنذار.

int _i(dynamic v, [int f = 0]) =>
    v is int ? v : (v is num ? v.toInt() : int.tryParse('$v') ?? f);

String? _s(dynamic v) =>
    (v is String && v.trim().isNotEmpty) ? v.trim() : null;

DateTime? _date(dynamic v) =>
    v == null ? null : DateTime.tryParse('$v')?.toLocal();

class FeedbackQuestion {
  const FeedbackQuestion({required this.key, required this.text, this.dimension = ''});

  final String key;

  /// موجود بالعقد ولا يُعرض — بُعد التحليل عند الإدارة لا عند اللاعب.
  final String dimension;
  final String text;

  factory FeedbackQuestion.fromJson(Map<String, dynamic> j) => FeedbackQuestion(
        key: '${j['key'] ?? ''}',
        dimension: '${j['dimension'] ?? ''}',
        text: '${j['text'] ?? ''}',
      );
}

class FeedbackScaleOption {
  const FeedbackScaleOption(this.v, this.label, this.color);
  final int v;
  final String label;
  final Color color;
}

/// سلّم ثابت **عند العميل** — ليس من الخادم.
const kFeedbackScale = <FeedbackScaleOption>[
  FeedbackScaleOption(1, 'سيّئ جداً', Color(0xFFEF4444)),
  FeedbackScaleOption(2, 'سيّئ', Color(0xFFF97316)),
  FeedbackScaleOption(3, 'متوسط', Color(0xFFEAB308)),
  FeedbackScaleOption(4, 'جيد', Color(0xFF84CC16)),
  FeedbackScaleOption(5, 'ممتاز', Color(0xFF22C55E)),
];

/// حدّ الملاحظات حرفاً؛ الخادم يقصّ إلى العدد نفسه.
const kMaxNotesLength = 1000;

/// سياق الغرفة — حقوله كلّها اختيارية وتُعرض شرطياً.
class FeedbackContext {
  const FeedbackContext({
    this.sessionId = 0,
    this.sessionName,
    this.sessionCode,
    this.activityName,
    this.locationName,
    this.playedAt,
  });

  final int sessionId;
  final String? sessionName, sessionCode, activityName, locationName;
  final DateTime? playedAt;

  factory FeedbackContext.fromJson(Map<String, dynamic> j) => FeedbackContext(
        sessionId: _i(j['sessionId']),
        sessionName: _s(j['sessionName']),
        sessionCode: _s(j['sessionCode']),
        activityName: _s(j['activityName']),
        locationName: _s(j['locationName']),
        playedAt: _date(j['playedAt']),
      );
}

/// عنصر من الطابور — نفس حقول السياق.
class PendingSurvey {
  const PendingSurvey({required this.sessionId, this.activityName, this.playedAt});

  final int sessionId;
  final String? activityName;
  final DateTime? playedAt;

  factory PendingSurvey.fromJson(Map<String, dynamic> j) => PendingSurvey(
        sessionId: _i(j['sessionId']),
        activityName: _s(j['activityName']),
        playedAt: _date(j['playedAt']),
      );
}

class FeedbackSurvey {
  const FeedbackSurvey({
    this.questions = const [],
    this.alreadyDone = false,
    this.context,
  });

  final List<FeedbackQuestion> questions;
  final bool alreadyDone;
  final FeedbackContext? context;

  factory FeedbackSurvey.fromJson(Map<String, dynamic> j) => FeedbackSurvey(
        questions: (j['questions'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => FeedbackQuestion.fromJson(Map<String, dynamic>.from(e)))
            .toList(),
        alreadyDone: j['alreadyDone'] == true,
        context: j['context'] is Map
            ? FeedbackContext.fromJson(
                Map<String, dynamic>.from(j['context'] as Map))
            : null,
      );
}

/// عدد المُجاب — القيمة المُجابة ≥ 1 دائماً.
int answeredCountOf(List<FeedbackQuestion> qs, Map<String, int> answers) =>
    qs.where((q) => (answers[q.key] ?? 0) >= 1).length;

/// 🔴 الإرسال ممنوع قبل اكتمال الكلّ: الخادم يردّ «إجابة غير صالحة أو
///    ناقصة: {key}» لأوّل مفتاحٍ ناقص، والزرّ المعطَّل يوفّر تلك الرحلة.
bool allAnsweredOf(List<FeedbackQuestion> qs, Map<String, int> answers) =>
    qs.isNotEmpty && answeredCountOf(qs, answers) == qs.length;

double progressOf(List<FeedbackQuestion> qs, Map<String, int> answers) =>
    answeredCountOf(qs, answers) / (qs.isEmpty ? 1 : qs.length);
