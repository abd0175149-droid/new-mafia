// ══════════════════════════════════════════════════════
// 🌟 رأيك بتجربتك — نموذج /api/player-experience (backend/src/services/experience.service.ts)
// ══════════════════════════════════════════════════════
// تقييمٌ عامّ لنادي المافيا لا لفعاليّة: الأسئلة بياناتٌ تأتي مع الحملة (stars · nps ·
// choice · multi · text)، والإجابات خريطةٌ مفتاحُها مفتاحُ السؤال.

class ExpQuestion {
  const ExpQuestion({
    required this.key,
    required this.type,
    required this.label,
    this.hint,
    this.section,
    this.required = false,
    this.options = const [],
    this.maxSelect,
    this.placeholder,
  });

  final String key;
  /// stars | nps | choice | multi | text
  final String type;
  final String label;
  final String? hint, section, placeholder;
  final bool required;
  final List<String> options;
  final int? maxSelect;

  factory ExpQuestion.fromJson(Map<String, dynamic> j) => ExpQuestion(
        key: '${j['key'] ?? ''}',
        type: '${j['type'] ?? 'text'}',
        label: '${j['label'] ?? ''}',
        hint: (j['hint'] as String?)?.trim().isEmpty ?? true ? null : j['hint'] as String,
        section: (j['section'] as String?)?.trim().isEmpty ?? true ? null : j['section'] as String,
        placeholder: j['placeholder'] as String?,
        required: j['required'] == true,
        options: [for (final o in (j['options'] as List? ?? const [])) '$o'],
        maxSelect: (j['maxSelect'] as num?)?.toInt(),
      );

  /// هل أُجيب؟ — النصّ الفارغ والقائمة الفارغة ليسا إجابة
  bool isFilled(dynamic v) {
    if (v == null) return false;
    if (v is List) return v.isNotEmpty;
    if (v is String) return v.trim().isNotEmpty;
    return true;
  }
}

class ExpCampaign {
  const ExpCampaign({
    required this.id,
    required this.title,
    this.intro = '',
    this.imageUrl,
    this.status = 'open',
    this.questions = const [],
  });

  final int id;
  final String title, intro, status;
  final String? imageUrl;
  final List<ExpQuestion> questions;

  bool get isOpen => status == 'open';

  factory ExpCampaign.fromJson(Map<String, dynamic> j) => ExpCampaign(
        id: (j['id'] as num?)?.toInt() ?? 0,
        title: '${j['title'] ?? ''}',
        intro: '${j['intro'] ?? ''}',
        imageUrl: (j['imageUrl'] as String?)?.trim().isEmpty ?? true ? null : j['imageUrl'] as String,
        status: '${j['status'] ?? 'open'}',
        questions: [
          for (final q in (j['questions'] as List? ?? const []))
            if (q is Map) ExpQuestion.fromJson(Map<String, dynamic>.from(q)),
        ],
      );
}

/// أوصافُ النجوم الخمس — مطابقةٌ للويب
const kExpStarLabels = ['سيّئة جداً', 'سيّئة', 'مقبولة', 'حلوة', 'ممتازة'];
