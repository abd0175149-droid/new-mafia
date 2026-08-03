import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../app/app_state.dart';
import '../../app/config.dart';
import '../../app/theme/theme.dart';
import '../../core/api/api_client.dart';
import '../../core/api/auth_repository.dart';
import '../../core/socket/socket_service.dart';
import '../../core/storage/session_store.dart';
import '../../core/ui/toast.dart';
import '../../models/profile.dart';
import '../history/history_screen.dart';
import 'my_cosmetic_card.dart';
import '../shell/core_status_screen.dart';
import 'avatar_cropper.dart';
import 'profile_palette.dart';
import 'profile_sections.dart';
import 'profile_settings.dart';
import 'progress_guide.dart';

// ══════════════════════════════════════════════════════
// 👤 الملفّ الشخصيّ — الملفّ 13
// ══════════════════════════════════════════════════════
// REST بالكامل: **لا سوكِت في هذه الشاشة إطلاقاً**.
//
// 📌 مؤجَّل بوعي، لا منسيّ: «تعرف على الكروت والأدوار» (§4.3.7) → مودال
//    الأدوار في الملفّ 22، وهو من طبقة اللعب في M4/M5. زرٌّ يعتذر أسوأ
//    من غيابه.

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key, required this.config});

  final AppConfig config;


  @override
  State<ProfileScreen> createState() => ProfileScreenState();
}

class ProfileScreenState extends State<ProfileScreen> {
  ProfileResponse? _profile;
  List<LeaderboardEntry> _leaderboard = const [];
  String? _error;
  bool _loading = true;

  /// حالة حفظٍ مشتركة بين الاسم والإيميل والصورة — تُظهر الطبقة فوق
  /// الأفاتار. مشتركة عمداً: لا معنى لحفظين متوازيين على نفس السجلّ.
  bool _saving = false;

  bool _editingName = false;
  bool _settingsOpen = false;

  late final TextEditingController _name = TextEditingController();
  final _nameFocus = FocusNode();
  final _settingsKey = GlobalKey();
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    _nameFocus.addListener(() {
      if (!_nameFocus.hasFocus && _editingName) _saveName();
    });
    _load();
  }

  @override
  void dispose() {
    MafiaToast.hide();
    _name.dispose();
    _nameFocus.dispose();
    _scroll.dispose();
    super.dispose();
  }

  /// يُستدعى من الشل عند العودة لهذا التبويب — الويب يعيد بناء الصفحة
  /// عند كل تنقّل، ونحن نحفظ الحالة، فيلزم جلبٌ صريح.
  void reload() {
    if (!_loading) _load();
  }

  void _toast(String m) => MafiaToast.show(context, m);

  // ══════════════════════════════════════════════════════
  // التحميل
  // ══════════════════════════════════════════════════════
  Future<void> _load() async {
    final id = SessionStore.instance.player?.id;
    if (id == null) {
      // بلا معرّف لا نداء شبكة أصلاً
      setState(() { _loading = false; _error = 'لم يتم العثور على حساب'; });
      return;
    }

    setState(() { _loading = true; _error = null; });

    // لوحة المتصدرين مستقلّة: فشلها يُخفي قسمها وحده بصمت
    unawaited(_loadLeaderboard());

    try {
      final r = await ApiClient.instance.get('/api/player/$id/profile');
      if (!mounted) return;
      if (r is! Map || r['success'] != true) {
        setState(() {
          _loading = false;
          _error = (r is Map ? r['error'] as String? : null) ?? 'خطأ';
        });
        return;
      }
      final p = ProfileResponse.fromJson(Map<String, dynamic>.from(r));
      setState(() {
        _profile = p;
        _name.text = p.player.name;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() { _loading = false; _error = e.message; });
    } catch (_) {
      if (mounted) setState(() { _loading = false; _error = 'خطأ في الاتصال'; });
    }
  }

  Future<void> _loadLeaderboard() async {
    try {
      final r = await ApiClient.instance.get('/api/player-app/leaderboard');
      // 🔴 الخادم يردّ `{success, leaderboard: [...]}`، والويب يفحص
      //    `Array.isArray(d)` — فيسقط الشرط دائماً ولا يظهر القسم هناك
      //    أبداً. نقرأ الشكل الحقيقيّ، فيظهر القسم هنا. انحرافٌ مقصود.
      final list = (r is Map ? r['leaderboard'] : r) as List?;
      if (list == null || !mounted) return;
      setState(() => _leaderboard = list
          .whereType<Map>()
          .take(5)
          .map((e) => LeaderboardEntry.fromJson(Map<String, dynamic>.from(e)))
          .toList());
    } catch (_) {
      // تجاهل صامت — القسم يختفي
    }
  }

  // ══════════════════════════════════════════════════════
  // الحفظ
  // ══════════════════════════════════════════════════════
  Future<void> _saveName() async {
    final p = _profile;
    if (p == null) return;
    final t = _name.text.trim();

    // فارغ أو لم يتغيّر → إلغاء صامت. الحارس يمنع أيضاً الحفظ المزدوج
    // حين يضغط اللاعب Enter ثم يفقد الحقل تركيزه.
    if (t.isEmpty || t == p.player.name) {
      setState(() { _editingName = false; _name.text = p.player.name; });
      return;
    }

    setState(() { _editingName = false; _saving = true; });
    try {
      final r = await ApiClient.instance
          .put('/api/player/${p.player.id}/profile', body: {'name': t});
      if (!mounted) return;
      if (r is Map && r['success'] == true) {
        setState(() => _profile = p.copyWith(player: p.player.copyWith(name: t)));
        _toast('✓ تم حفظ الاسم');
      } else {
        _name.text = p.player.name;
        _toast((r is Map ? r['error'] as String? : null) ?? 'خطأ');
      }
    } on ApiException catch (e) {
      _name.text = p.player.name;
      _toast(e.message);
    } catch (_) {
      _name.text = p.player.name;
      _toast('خطأ');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<bool> _saveEmail(String? email) async {
    final p = _profile;
    if (p == null) return false;
    setState(() => _saving = true);
    try {
      final r = await ApiClient.instance
          .put('/api/player/${p.player.id}/profile', body: {'email': email});
      if (!mounted) return false;
      if (r is Map && r['success'] == true) {
        setState(() => _profile = p.copyWith(player: p.player.copyWith(email: email)));
        _toast('✓ تم حفظ الإيميل');
        return true;
      }
      _toast((r is Map ? r['error'] as String? : null) ?? 'خطأ');
      return false;
    } on ApiException catch (e) {
      _toast(e.message);
      return false;
    } catch (_) {
      _toast('خطأ');
      return false;
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  // ══════════════════════════════════════════════════════
  // خطّ أنابيب الأفاتار — §6.5
  // ══════════════════════════════════════════════════════
  Future<void> _pickAvatar() async {
    final p = _profile;
    if (p == null || _saving) return;

    XFile? picked;
    try {
      picked = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        // ١٠٠ لا يضغط، لكنه يجبر image_picker على إعادة الترميز — فيصل
        // HEIC من كاميرا iOS كـJPEG، ويُصحَّح دوران EXIF على أندرويد.
        imageQuality: 100,
      );
    } catch (_) {
      _toast('تعذّر فتح المعرض');
      return;
    }
    if (picked == null || !mounted) return;

    if (await picked.length() > AvatarPipeline.maxFileBytes) {
      if (mounted) _toast('الصورة كبيرة جداً (أقصى 10MB)');
      return;
    }

    final bytes = await picked.readAsBytes();
    if (!mounted) return;

    final dataUrl = await openAvatarCropper(context, bytes);
    if (dataUrl == null || !mounted) return;

    setState(() => _saving = true);
    try {
      final r = await ApiClient.instance
          .post('/api/player/${p.player.id}/avatar', body: {'image': dataUrl});
      if (!mounted) return;
      if (r is Map && r['success'] == true && r['avatarUrl'] is String) {
        final fresh = r['avatarUrl'] as String;
        await _evict(p.player.avatarUrl);
        if (!mounted) return;
        setState(() => _profile = p.copyWith(player: p.player.copyWith(avatarUrl: fresh)));
        _toast('✓ تم تحديث الصورة');
      } else {
        _toast((r is Map ? r['error'] as String? : null) ?? 'خطأ');
      }
    } on ApiException catch (e) {
      _toast(e.message);
    } catch (_) {
      _toast('خطأ في رفع الصورة');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  /// الخادم يعيد الرابط ومعه `?v=<ts>` فيتغيّر المفتاح — لكن الرابط
  /// **القديم** يبقى في الكاش، وأيّ قائمة ما زالت تحمله تعرض الصورة
  /// السابقة. نُخلي الأصل والمصغّر معاً.
  Future<void> _evict(String? oldPath) async {
    if (oldPath == null) return;
    final abs = ApiClient.instance.upload(oldPath);
    try {
      await CachedNetworkImage.evictFromCache(abs);
      final thumb = avatarThumb(abs);
      if (thumb != null && thumb != abs) await CachedNetworkImage.evictFromCache(thumb);
    } catch (_) { /* الإخلاء أفضل جهد */ }
  }

  // ══════════════════════════════════════════════════════
  // البناء
  // ══════════════════════════════════════════════════════
  @override
  Widget build(BuildContext context) {
    if (_loading) return const _FullScreenSpinner();
    final p = _profile;
    if (p == null || _error != null) return _ErrorView(message: _error, onBack: _load);

    final expanded = context.sizeClass == WindowSizeClass.expanded;
    final maxWidth = switch (context.sizeClass) {
      WindowSizeClass.compact => 512.0,
      WindowSizeClass.medium => 640.0,
      WindowSizeClass.expanded => 960.0,
    };

    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        onRefresh: _load,
        color: Tw.amber500,
        backgroundColor: Noir.charcoal,
        child: SingleChildScrollView(
          controller: _scroll,
          // التمرير مطلوب دائماً كي يعمل السحب للتحديث حتى بمحتوى قصير
          physics: const AlwaysScrollableScrollPhysics(),
          child: Center(
            child: ConstrainedBox(
              constraints: BoxConstraints(maxWidth: maxWidth),
              child: expanded ? _twoPane(p) : _onePane(p),
            ),
          ),
        ),
      ),
    );
  }

  Widget _onePane(ProfileResponse p) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ..._identityColumn(p),
          const SizedBox(height: 20),
          ..._detailColumn(p),
          const SizedBox(height: 80),
        ],
      );

  /// عمودان على 10–11 إنش، بتمريرٍ **واحد** — عمودان مستقلّان يجعلان
  /// «مرّر إلى الإعدادات» من زرّ الترس مسألةَ أيّ العمودين.
  Widget _twoPane(ProfileResponse p) => Padding(
        padding: const EdgeInsets.only(bottom: 80),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 400,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: _identityColumn(p),
              ),
            ),
            const SizedBox(width: 20),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.only(top: 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: _detailColumn(p),
                ),
              ),
            ),
          ],
        ),
      );

  List<Widget> _identityColumn(ProfileResponse p) => [
        _Hero(
          player: p.player,
          progression: p.progression,
          saving: _saving,
          editingName: _editingName,
          nameController: _name,
          nameFocus: _nameFocus,
          onNameTap: () {
            setState(() => _editingName = true);
            _name.text = p.player.name;
            WidgetsBinding.instance
                .addPostFrameCallback((_) => _nameFocus.requestFocus());
          },
          onNameSubmit: _saveName,
          onAvatarTap: _pickAvatar,
          onGear: _openSettings,
        ),
        const SizedBox(height: 4),
        // 🪙 «بطاقتي بمظهري» — §4.1 في الملفّ ٣٤. يظهر **فقط** إن وُجد
        //    إطارٌ أو لقبٌ أو تأثير اسم، ويُقرأ من المزوّد لا من بناءٍ
        //    مشروط (نفس البنية التي أوقعت الويب في خلل الخطّافات).
        MyCosmeticCard(player: p.player),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: RankProgressCard(progression: p.progression),
        ),
        const SizedBox(height: 20),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: PerformanceCard(stats: p.stats),
        ),
        const SizedBox(height: 20),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: ExtraStatsGrid(stats: p.stats, progression: p.progression),
        ),
      ];

  List<Widget> _detailColumn(ProfileResponse p) => [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: AnalysisCard(stats: p.stats, progression: p.progression),
        ),
        if (_leaderboard.isNotEmpty) ...[
          const SizedBox(height: 20),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: LeaderboardCard(rows: _leaderboard, myId: p.player.id),
          ),
        ],
        if (p.matchHistory.isNotEmpty) ...[
          const SizedBox(height: 20),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: MatchHistoryCard(
              matches: p.matchHistory,
              onOpenFullHistory: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const HistoryScreen())),
            ),
          ),
        ],
        const SizedBox(height: 20),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: SettingsAccordion(
            key: _settingsKey,
            player: p.player,
            open: _settingsOpen,
            onToggle: () => setState(() => _settingsOpen = !_settingsOpen),
            onEmailSaved: _saveEmail,
            onDiagnostics: _openDiagnostics,
          ),
        ),
        const SizedBox(height: 20),
        Center(child: _guideButton(p.progression.rankTier)),
        const SizedBox(height: 16),
        Center(child: _logoutButton()),
      ];

  void _openSettings() {
    setState(() => _settingsOpen = true);
    // 100ms — الـaccordion يحتاج إطاراً لينفتح قبل قياس موضعه، وإلا
    // مُرِّر إلى ارتفاعه المطويّ
    Timer(const Duration(milliseconds: 100), () {
      final ctx = _settingsKey.currentContext;
      if (ctx == null || !mounted) return;
      Scrollable.ensureVisible(ctx,
          alignment: 0.5, duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
    });
  }

  void _openDiagnostics() {
    // شاشة التشخيص الحقيقية في الملفّ 06؛ شاشة حالة النواة تفعل ما
    // تحتاجه بالضبط اليوم (إذن الإشعارات، حالة السوكِت، اختبار REST).
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => CoreStatusScreen(
          config: widget.config),
    ));
  }

  Widget _guideButton(String tier) => InkWell(
        onTap: () => showProgressGuide(context, tier),
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
          decoration: BoxDecoration(
            color: Tw.amber500.withValues(alpha: 0.05),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Tw.amber500.withValues(alpha: 0.15)),
          ),
          child: Text('📖 كيف يعمل نظام النقاط والرتب؟',
              style: ar(12, color: Tw.amber400.withValues(alpha: 0.8))),
        ),
      );

  Widget _logoutButton() => InkWell(
        onTap: () async {
          await AuthRepository.instance.logout();
          SocketService.instance.reauth();
          AppState.instance.onLoggedOut();
        },
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Tw.red500.withValues(alpha: 0.10)),
          ),
          child: Text('🚪 تسجيل الخروج',
              style: ar(12, color: Tw.red500.withValues(alpha: 0.6))),
        ),
      );
}

// ══════════════════════════════════════════════════════
// §4.1 / §4.2 التحميل والخطأ
// ══════════════════════════════════════════════════════
class _FullScreenSpinner extends StatelessWidget {
  const _FullScreenSpinner();

  @override
  Widget build(BuildContext context) => const Center(
        child: SizedBox(
          width: 48,
          height: 48,
          child: CircularProgressIndicator(strokeWidth: 4, color: Tw.amber500),
        ),
      );
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onBack});
  final String? message;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(message ?? 'لم يتم العثور على البروفايل',
                  textAlign: TextAlign.center,
                  style: ar(20, color: Tw.amber400, weight: FontWeight.w700)),
              const SizedBox(height: 16),
              InkWell(
                onTap: onBack,
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
                  decoration: BoxDecoration(
                    color: Tw.gray900,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Tw.amber500.withValues(alpha: 0.30)),
                  ),
                  child: Text('العودة', style: ar(14, color: Tw.amber400)),
                ),
              ),
            ],
          ),
        ),
      );
}

// ══════════════════════════════════════════════════════
// §4.3.1 قسم الـHERO
// ══════════════════════════════════════════════════════
class _Hero extends StatelessWidget {
  const _Hero({
    required this.player,
    required this.progression,
    required this.saving,
    required this.editingName,
    required this.nameController,
    required this.nameFocus,
    required this.onNameTap,
    required this.onNameSubmit,
    required this.onAvatarTap,
    required this.onGear,
  });

  final PlayerInfo player;
  final PlayerProgression progression;
  final bool saving, editingName;
  final TextEditingController nameController;
  final FocusNode nameFocus;
  final VoidCallback onNameTap, onAvatarTap, onGear;
  final Future<void> Function() onNameSubmit;

  @override
  Widget build(BuildContext context) {
    final rank = RankConfig.of(progression.rankTier);
    final big = context.sizeClass == WindowSizeClass.expanded;
    final avatarSize = big ? 176.0 : 144.0;

    return Stack(
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.fromLTRB(24, 24, 24, 32),
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xFF0A0500), Color(0xFF000000)],
            ),
          ),
          child: Column(children: [
            _avatar(rank, avatarSize),
            const SizedBox(height: 12),
            _name(),
            const SizedBox(height: 6),
            _rankPill(rank),
            const SizedBox(height: 14),
            _levelAndXp(rank, big),
            const SizedBox(height: 10),
            Text(
              player.createdAt == null ? 'انضم —' : 'انضم ${player.createdAt!.year}',
              style: ar(12, color: Tw.gray600),
            ),
          ]),
        ),

        // ⚙️ يسار **فيزيائيّ** — يبقى يساراً في RTL (`left-6` في الويب).
        //    Positioned لا PositionedDirectional: الثاني ينقلب مع الاتجاه.
        Positioned(
          top: 24,
          left: 24,
          child: InkWell(
            onTap: onGear,
            customBorder: const CircleBorder(),
            child: Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0x0DFFFFFF),
                border: Border.all(color: const Color(0x1AFFFFFF)),
              ),
              child: const Center(child: Text('⚙️', style: TextStyle(fontSize: 16))),
            ),
          ),
        ),
      ],
    );
  }

  Widget _avatar(RankConfig rank, double size) => SizedBox(
        width: size,
        height: size,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            GestureDetector(
              onTap: saving ? null : onAvatarTap,
              child: Container(
                width: size,
                height: size,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: rank.color, width: 5),
                  gradient: const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Color(0xFF1A1A1A), Color(0xFF0D0D0D)],
                  ),
                  boxShadow: [
                    BoxShadow(color: rank.color.withValues(alpha: 0.19), blurRadius: 40),
                    BoxShadow(color: rank.color.withValues(alpha: 0.06), blurRadius: 80),
                    if (rank.extraGlow)
                      BoxShadow(color: Tw.red500.withValues(alpha: 0.13), blurRadius: 60),
                  ],
                ),
                clipBehavior: Clip.antiAlias,
                child: _avatarContent(size),
              ),
            ),

            // 📷 يسار فيزيائيّ أيضاً
            Positioned(
              bottom: 0,
              left: 0,
              child: GestureDetector(
                onTap: saving ? null : onAvatarTap,
                child: Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: rank.color,
                    border: Border.all(color: Colors.black, width: 2),
                    boxShadow: const [BoxShadow(color: Color(0x80000000), blurRadius: 8)],
                  ),
                  child: const Center(child: Text('📷', style: TextStyle(fontSize: 14))),
                ),
              ),
            ),
          ],
        ),
      );

  Widget _avatarContent(double size) {
    final abs = ApiClient.instance.upload(player.avatarUrl);
    final fallback = Center(
      child: Text(player.isFemale ? '👩' : '👤',
          style: TextStyle(fontSize: size * 0.33)),
    );

    return Stack(fit: StackFit.expand, children: [
      if (abs.isEmpty)
        fallback
      else
        CachedNetworkImage(
          imageUrl: abs,
          fit: BoxFit.cover,
          errorWidget: (_, __, ___) => fallback,
        ),
      if (saving)
        const ColoredBox(
          color: Color(0x99000000),
          child: Center(
            child: SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(strokeWidth: 2, color: Tw.amber400),
            ),
          ),
        ),
    ]);
  }

  Widget _name() {
    if (!editingName) {
      return GestureDetector(
        onTap: onNameTap,
        child: Text(player.name,
            textAlign: TextAlign.center,
            style: ar(24, weight: FontWeight.w900)),
      );
    }
    return SizedBox(
      width: 192,
      child: TextField(
        controller: nameController,
        focusNode: nameFocus,
        autofocus: true,
        textAlign: TextAlign.center,
        textInputAction: TextInputAction.done,
        onSubmitted: (_) => onNameSubmit(),
        style: ar(24, weight: FontWeight.w900),
        decoration: const InputDecoration(
          isDense: true,
          enabledBorder: UnderlineInputBorder(
              borderSide: BorderSide(color: Color(0x80F59E0B), width: 2)),
          focusedBorder: UnderlineInputBorder(
              borderSide: BorderSide(color: Color(0x80F59E0B), width: 2)),
        ),
      ),
    );
  }

  Widget _rankPill(RankConfig rank) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              rank.color.withValues(alpha: 0.08),
              rank.color.withValues(alpha: 0.02),
            ],
          ),
          border: Border.all(color: rank.color.withValues(alpha: 0.25), width: 2),
          boxShadow: [BoxShadow(color: rank.color.withValues(alpha: 0.06), blurRadius: 15)],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(rank.icon, style: const TextStyle(fontSize: 20)),
            const SizedBox(width: 8),
            Text(rank.nameAr,
                style: ar(14, color: rank.color, weight: FontWeight.w700)),
            const SizedBox(width: 6),
            // الـenum لاتينيّ محض — بلا لفّه يقفز خلف الاسم العربيّ
            Directionality(
              textDirection: TextDirection.ltr,
              child: Text(rank.tier,
                  style: ar(14, color: rank.color, weight: FontWeight.w700)),
            ),
          ],
        ),
      );

  Widget _levelAndXp(RankConfig rank, bool big) {
    final shield = big ? 72.0 : 64.0;
    final remaining = progression.nextLevelXP - progression.xp;

    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 320),
      child: Row(
        children: [
          Container(
            width: shield,
            height: shield,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [rank.color.withValues(alpha: 0.15), const Color(0xFF0A0A0A)],
              ),
              border: Border.all(color: rank.color.withValues(alpha: 0.31), width: 2),
              boxShadow: [
                BoxShadow(
                    color: rank.color.withValues(alpha: 0.08),
                    blurRadius: 15,
                    offset: const Offset(0, 4)),
              ],
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // لاتينيّ + أحرف كبيرة → التباعد مسموح هنا وحده
                const Text('LEVEL',
                    style: TextStyle(
                        fontFamily: 'Tajawal',
                        fontSize: 7,
                        fontWeight: FontWeight.w700,
                        color: Tw.gray400,
                        letterSpacing: 1.4)),
                Text('${progression.level}', style: num_(24, color: rank.color)),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('التقدم XP', style: ar(10, color: Tw.gray500)),
                    ltrText('${progression.xp} / ${progression.nextLevelXP} XP',
                        num_(10, color: rank.color, weight: FontWeight.w400)),
                  ],
                ),
                const SizedBox(height: 4),
                ProgressBar(value: progression.xpProgress / 100, color: rank.color),
                const SizedBox(height: 4),
                Text(
                  remaining > 0
                      ? 'المستوى التالي: ${ltrRun('$remaining XP')}'
                      : 'جاهز للمستوى التالي',
                  style: ar(9, color: Tw.gray600),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
