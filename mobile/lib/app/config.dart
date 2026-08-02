// ══════════════════════════════════════════════════════
// ⚙️ إعداد النكهة — §6.2
// ══════════════════════════════════════════════════════
// الروابط **في الكود** لا في --dart-define: بناءٌ واحد يجب ألّا يتغيّر
// سلوكه بمتغيّر خارجيّ. نسخة dev تشير إلى staging ونسخة prod إلى
// الإنتاج، ولا سبيل لأن تُبنى نسخة prod تتحدّث إلى staging سهواً.

enum Flavor { dev, prod }

class AppConfig {
  const AppConfig({
    required this.flavor,
    required this.appName,
    required this.baseUrl,
  });

  final Flavor flavor;
  final String appName;
  final String baseUrl;

  /// السوكِت على نفس الأصل بمسار /socket.io
  String get socketUrl => baseUrl;

  /// الرفوعات على نفس الأصل
  String get uploadsBase => baseUrl;

  bool get isDev => flavor == Flavor.dev;

  // ⚠️ نكهة dev تشير إلى **الإنتاج** — قرار المالك في 2 أغسطس 2026.
  //
  // بيئة staging قائمة على الخادم لكنها متأخّرة 365 كوميت (آخر نشر 18
  // يونيو): بلا اقتصاد التشبس، وبلا العمدة، وبلا بوابة الإصدار. والمالك
  // يعمل على الإنتاج مباشرةً، فتحديثها كان سيبني بيئةً لا يستعملها أحد.
  //
  // ما يعنيه ذلك بصراحة: كل دخول من التطبيق واتصال سوكِت وتوكن إشعار
  // يقع على البيانات الحيّة. ما يخفّفه أن حساب الاختبار موسوم
  // `is_test_account`، وهو مستثنى من قمع المتجر وتقارير التشبس ولوحة
  // الرتب — فالتجربة لا تحرّك رقماً يُقرأ.
  //
  // وما بقي من معنى للنكهتين: معرّفان منفصلان واسمان مختلفان، فتتعايشان
  // على الجهاز الواحد. لإعادة الفصل يكفي تغيير هذا السطر وحده.
  static const dev = AppConfig(
    flavor: Flavor.dev,
    appName: 'Mafia Club Dev',
    baseUrl: 'https://club-mafia.grade.sbs',
  );

  static const prod = AppConfig(
    flavor: Flavor.prod,
    appName: 'Mafia Club',
    baseUrl: 'https://club-mafia.grade.sbs',
  );

  /// 🔗 حلّ روابط الرفوعات — البوّابة الوحيدة.
  ///
  /// الـPWA كانت تنادي `/uploads/*` نسبياً والبروكسي يحوّلها؛ ولا بروكسي
  /// هنا. أي مسار نسبيّ يصل في حمولة REST أو Socket (صورة، صوت، قالب
  /// بطاقة) يمرّ من هنا. **ممنوع بناء رابط رفعٍ يدوياً في أي شاشة** —
  /// مسار واحد منسيّ يعني صورة مكسورة لا يراها إلا اللاعب.
  String resolveUpload(String? path) {
    if (path == null || path.isEmpty) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return path.startsWith('/') ? '$uploadsBase$path' : '$uploadsBase/$path';
  }
}
