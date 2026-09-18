import 'activity.dart' show monthNames, dayNameOf;
import 'fnb.dart' show arDigits;

// ══════════════════════════════════════════════════════
// 🎟️ نماذج بطاقة الولاء (ختم الدون) — `GET /api/loyalty/me`
// ══════════════════════════════════════════════════════
// الختم = حجزٌ من التطبيق قبل الفعاليّة بـ`minLeadHours` + مباراةٌ واحدة
// تلك الليلة. البطاقة تُصفَّر أوّل كلّ شهر (`period` = 'YYYY-MM').
//
// 🔴 المفتاح الرئيسيّ: `enabled:false` (أو فشل النداء) يعني أن **لا شيء**
//    من الولاء يُعرض في أيّ مكان — لا لافتة ولا سطر على بطاقة الفعاليّة
//    ولا صفحة. كلّ ودجت ولاء تُقفل على `enabled == true`.

int _i(dynamic v, [int f = 0]) =>
    v is int ? v : (v is num ? v.toInt() : int.tryParse('$v') ?? f);

double? _d(dynamic v) =>
    v == null ? null : (v is num ? v.toDouble() : double.tryParse('$v'));

DateTime? _date(dynamic v) => v == null ? null : DateTime.tryParse('$v');

String? _s(dynamic v) => (v is String && v.trim().isNotEmpty) ? v.trim() : null;

// ══════════════════════════════════════════════════════
// 🕰️ توقيت الأردن — UTC+3 على مدار السنة منذ 2022
// ══════════════════════════════════════════════════════
// 🔴 لا `toLocal()`: القطع يُحسب على الخادم بتوقيت عمّان، ولاعبٌ مسافر
//    يرى «كان القطع 14:00» بتوقيت جهازه فيظنّ أن الحساب خاطئ.
DateTime jordanTime(DateTime t) => t.toUtc().add(const Duration(hours: 3));

String jordanHHMM(DateTime t) {
  final j = jordanTime(t);
  return '${j.hour.toString().padLeft(2, '0')}:${j.minute.toString().padLeft(2, '0')}';
}

/// «١٥ سبتمبر» — بتوقيت الأردن وبأرقامٍ عربيّة.
String jordanDayMonth(DateTime t) {
  final j = jordanTime(t);
  return '${arDigits(j.day)} ${monthNames[j.month - 1]}';
}

/// اسم شهر الفترة `'2026-09'` → «سبتمبر».
String periodMonthName(String period) {
  final parts = period.split('-');
  if (parts.length < 2) return period;
  final m = int.tryParse(parts[1]);
  if (m == null || m < 1 || m > 12) return period;
  return monthNames[m - 1];
}

// ══════════════════════════════════════════════════════
// الإعدادات
// ══════════════════════════════════════════════════════
class LoyaltyConfig {
  const LoyaltyConfig({
    this.stampsPerReward = 5,
    this.minLeadHours = 6,
    this.maxRewardsPerMonth = 3,
    this.rewardValidityDays = 45,
    this.chooseWindowDays = 3,
    this.kinds = const ['free_visit', 'free_drink', 'chips'],
    this.chipsAmount = 40,
    this.drinkCapJod = 3,
  });

  final int stampsPerReward, minLeadHours, maxRewardsPerMonth;
  final int rewardValidityDays, chooseWindowDays;
  final List<String> kinds;
  final int chipsAmount;
  final double drinkCapJod;

  factory LoyaltyConfig.fromJson(Map<String, dynamic> j) => LoyaltyConfig(
        stampsPerReward: _i(j['stampsPerReward'], 5),
        minLeadHours: _i(j['minLeadHours'], 6),
        maxRewardsPerMonth: _i(j['maxRewardsPerMonth'], 3),
        rewardValidityDays: _i(j['rewardValidityDays'], 45),
        chooseWindowDays: _i(j['chooseWindowDays'], 3),
        kinds: (j['kinds'] as List? ?? const [])
            .map((e) => '$e')
            .where((e) => e.isNotEmpty)
            .toList(),
        chipsAmount: _i(j['chipsAmount'], 40),
        drinkCapJod: _d(j['drinkCapJod']) ?? 3,
      );
}

/// «٣ د.أ» لا «3.0 د.أ»
String jodText(double v) {
  final s = v == v.roundToDouble() ? v.toInt().toString() : v.toStringAsFixed(2);
  return '${arDigits(s)} د.أ';
}

// ══════════════════════════════════════════════════════
// البطاقة الحاليّة
// ══════════════════════════════════════════════════════
class LoyaltyCard {
  const LoyaltyCard({
    this.stamps = 0,
    this.inCard = 0,
    this.needed = 0,
    this.cardsCompleted = 0,
    this.capReached = false,
  });

  /// كلّ أختام الشهر · داخل البطاقة الجارية · الباقي · بطاقاتٌ اكتملت
  final int stamps, inCard, needed, cardsCompleted;
  final bool capReached;

  factory LoyaltyCard.fromJson(Map<String, dynamic> j) => LoyaltyCard(
        stamps: _i(j['stamps']),
        inCard: _i(j['inCard']),
        needed: _i(j['needed']),
        cardsCompleted: _i(j['cardsCompleted']),
        capReached: j['capReached'] == true,
      );
}

// ══════════════════════════════════════════════════════
// الزيارات
// ══════════════════════════════════════════════════════
class LoyaltyVisit {
  const LoyaltyVisit({
    required this.activityId,
    required this.activityName,
    this.date,
    this.locationName,
    this.played = false,
    this.verdict = '',
    this.leadHours,
    this.bookingCreatedBy,
    this.stampNo,
  });

  final int activityId;
  final String activityName;
  final DateTime? date;
  final String? locationName;
  final bool played;

  /// `stamped | late | channel | no_booking | no_show | voided | location`
  final String verdict;
  final double? leadHours;
  final String? bookingCreatedBy;
  final int? stampNo;

  bool get stamped => verdict == 'stamped';

  factory LoyaltyVisit.fromJson(Map<String, dynamic> j) => LoyaltyVisit(
        activityId: _i(j['activityId']),
        activityName: (j['activityName'] ?? '').toString(),
        date: _date(j['date']),
        locationName: _s(j['locationName']),
        played: j['played'] == true,
        verdict: (j['verdict'] ?? '').toString(),
        leadHours: _d(j['leadHours']),
        bookingCreatedBy: _s(j['bookingCreatedBy']),
        stampNo: j['stampNo'] == null ? null : _i(j['stampNo']),
      );

  /// نصّ الحكم القصير في الحبّة.
  String get verdictLabel => switch (verdict) {
        'stamped' => '✦ ختم ${arDigits(stampNo ?? 0)}',
        'late' => 'بلا ختم',
        'channel' => 'بلا ختم',
        'no_booking' => 'بلا ختم',
        'no_show' => 'حجزت ولم تلعب',
        'voided' => 'ختم ملغى',
        'location' => 'خارج البرنامج',
        _ => verdict,
      };

  /// سطر التفسير تحت اسم الفعاليّة.
  String get explanation {
    switch (verdict) {
      case 'stamped':
        final h = leadHours;
        return h == null
            ? 'حجزت من التطبيق ولعبت'
            : 'حجزت قبل ${arDigits(h.floor())} ساعة ولعبت';
      case 'late':
        final h = leadHours;
        if (h == null || h < 0) return 'حجزت بعد بدء الفعاليّة';
        final hh = h < 1 ? h.toStringAsFixed(1) : h.floor().toString();
        return 'حجزت قبل ${arDigits(hh)} ساعة فقط';
      case 'channel':
        return 'الحجز لم يكن من التطبيق';
      case 'no_booking':
        return 'لعبت بلا حجز';
      case 'no_show':
        return 'حجزت ولم تلعب';
      case 'voided':
        return 'ختم ملغى';
      case 'location':
        return 'مكان خارج البرنامج';
    }
    return '';
  }
}

// ══════════════════════════════════════════════════════
// المكافآت
// ══════════════════════════════════════════════════════
class LoyaltyReward {
  const LoyaltyReward({
    required this.id,
    this.period = '',
    this.seq = 0,
    this.kind = '',
    this.status = '',
    this.value = const {},
    this.earnedAt,
    this.chooseBy,
    this.expiresAt,
    this.redeemedAt,
    this.note,
  });

  final int id;
  final String period;
  final int seq;

  /// `free_visit | free_drink | chips`
  final String kind;

  /// `pending_choice | available | redeemed | expired | void`
  final String status;
  final Map<String, dynamic> value;
  final DateTime? earnedAt, chooseBy, expiresAt, redeemedAt;
  final String? note;

  bool get isPendingChoice => status == 'pending_choice';
  bool get isAvailable => status == 'available';
  bool get isFreeVisit => kind == 'free_visit';
  bool get isFreeDrink => kind == 'free_drink';
  bool get isChips => kind == 'chips';

  factory LoyaltyReward.fromJson(Map<String, dynamic> j) => LoyaltyReward(
        id: _i(j['id']),
        period: (j['period'] ?? '').toString(),
        seq: _i(j['seq']),
        kind: (j['kind'] ?? '').toString(),
        status: (j['status'] ?? '').toString(),
        value: j['value'] is Map ? Map<String, dynamic>.from(j['value'] as Map) : const {},
        earnedAt: _date(j['earnedAt']),
        chooseBy: _date(j['chooseBy']),
        expiresAt: _date(j['expiresAt']),
        redeemedAt: _date(j['redeemedAt']),
        note: _s(j['note']),
      );

  static String kindLabel(String kind, {int chips = 40}) => switch (kind) {
        'free_visit' => '🎟️ زيارة مجّانيّة',
        'free_drink' => '☕ مشروب مجّاني',
        'chips' => '🪙 ${arDigits(chips)} تشبس',
        _ => kind.isEmpty ? '🎁 مكافأة' : kind,
      };

  String label({int chips = 40}) {
    // التشبس المكتوبة في القيمة أدقّ من الإعداد الحاليّ (قد يتغيّر لاحقاً)
    final v = value['chips'];
    return kindLabel(isPendingChoice ? '' : kind,
        chips: v is num ? v.toInt() : chips);
  }

  String get statusLabel => switch (status) {
        'pending_choice' => 'بانتظار اختيارك',
        'available' => 'جاهزة',
        'redeemed' => 'استُخدمت',
        'expired' => 'انتهت',
        'void' => 'ملغاة',
        _ => status,
      };
}

// ══════════════════════════════════════════════════════
// الحمولة الكاملة
// ══════════════════════════════════════════════════════
class LoyaltyMe {
  const LoyaltyMe({
    required this.enabled,
    this.period = '',
    this.config = const LoyaltyConfig(),
    this.card = const LoyaltyCard(),
    this.visits = const [],
    this.rewards = const [],
    this.pendingChoice,
    this.available = const [],
  });

  final bool enabled;
  final String period;
  final LoyaltyConfig config;
  final LoyaltyCard card;
  final List<LoyaltyVisit> visits;
  final List<LoyaltyReward> rewards;
  final LoyaltyReward? pendingChoice;
  final List<LoyaltyReward> available;

  String get monthName => periodMonthName(period);

  /// زيارةٌ مجّانيّة جاهزة — تُطبَّق تلقائيّاً على الحجز القادم.
  LoyaltyReward? get availableFreeVisit =>
      available.where((r) => r.isFreeVisit).firstOrNull;

  static const disabled = LoyaltyMe(enabled: false);

  factory LoyaltyMe.fromJson(Map<String, dynamic> j) {
    if (j['enabled'] != true) return disabled;
    List<LoyaltyReward> rewards(dynamic v) => (v as List? ?? const [])
        .whereType<Map>()
        .map((e) => LoyaltyReward.fromJson(Map<String, dynamic>.from(e)))
        .toList();
    return LoyaltyMe(
      enabled: true,
      period: (j['period'] ?? '').toString(),
      config: j['config'] is Map
          ? LoyaltyConfig.fromJson(Map<String, dynamic>.from(j['config'] as Map))
          : const LoyaltyConfig(),
      card: j['card'] is Map
          ? LoyaltyCard.fromJson(Map<String, dynamic>.from(j['card'] as Map))
          : const LoyaltyCard(),
      visits: (j['visits'] as List? ?? const [])
          .whereType<Map>()
          .map((e) => LoyaltyVisit.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
      rewards: rewards(j['rewards']),
      pendingChoice: j['pendingChoice'] is Map
          ? LoyaltyReward.fromJson(
              Map<String, dynamic>.from(j['pendingChoice'] as Map))
          : null,
      available: rewards(j['available']),
    );
  }
}

/// «١٥ سبتمبر» + اسم اليوم — لسِكّة التاريخ في قائمة الزيارات.
({String day, String weekday}) visitDayParts(DateTime? t) {
  if (t == null) return (day: '—', weekday: '');
  final j = jordanTime(t);
  return (day: arDigits(j.day), weekday: dayNameOf(j));
}
