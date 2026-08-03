import 'dart:async';

import '../../core/socket/socket_service.dart';
import '../../core/storage/session_store.dart';
import '../../models/game.dart';
import 'game_session_controller.dart';

// ══════════════════════════════════════════════════════
// 🚪 تدفّق الدخول والانضمام — §6 في الملفّ 21
// ══════════════════════════════════════════════════════
// يسلّم إلى نواة الحالة (٢٠) بمجرّد بلوغ `done` أو `rejoined`.

/// 🔴 الهاتف الأردنيّ يُطبَّع ببادئة صفر دائماً — الخادم يبحث بالمطابقة
///    التامّة، ورقمٌ بلا بادئة لا يجد مقعده.
String normalizePhone(String? raw) {
  final d = (raw ?? '').replaceAll(RegExp(r'\D'), '');
  if (d.isEmpty) return '';
  if (d.startsWith('962')) return '0${d.substring(3)}';
  return d.startsWith('0') ? d : '0$d';
}

extension JoinFlow on GameSessionController {
  /// 6.2 — البحث بالرمز. عند وجود جلسةٍ محفوظة يذهب مباشرةً إلى الاستعادة
  /// بدل أن يطلب الهاتف: من دخل مرّةً لا يُسأل ثانيةً.
  Future<void> findRoom([String? code]) async {
    final target = (code ?? roomCodeInput).trim();
    if (target.isEmpty) return;
    setBusy(true);
    clearApiError();

    final res = await SocketService.instance
        .ask('room:find-by-code', {'roomCode': target});

    // 🔴 قد يردّ `{success:false}` **بلا رفض** — تُعامَل كغرفةٍ غير متاحة
    if (res == null || res['success'] == false || res['roomId'] == null) {
      setBusy(false);
      setApiError(res?['error'] as String? ?? 'لم يتم العثور على اللعبة');
      return;
    }

    applyFoundRoom(
      roomId: '${res['roomId']}',
      roomCode: target,
      gameName: '${res['gameName'] ?? ''}',
      maxPlayers: (res['maxPlayers'] as num?)?.toInt() ?? 10,
      requireTicket: res['requireTicket'] == true,
    );

    final player = SessionStore.instance.player;
    if (SessionStore.instance.token != null && player != null) {
      await tryRejoinCurrentRoom(
        playerId: player.id,
        phone: player.phone,
        ticketRequired: res['requireTicket'] == true,
        roomIdOverride: '${res['roomId']}',
      );
      setBusy(false);
      return;
    }

    setBusy(false);
    // استُدعيت يدوياً ⇒ اطلب الهاتف. ومن رابط QR لا تتقدّم تلقائياً.
    if (code == null) setStep(GameStep.phone);
  }

  /// 6.3 — ثلاث مراحل: سوكِت، ثمّ `/me`، ثمّ انضمامٌ جديد.
  Future<void> tryRejoinCurrentRoom({
    required int playerId,
    String? phone,
    bool ticketRequired = false,
    String? roomIdOverride,
  }) async {
    final targetRoom = roomIdOverride ?? roomId;
    final normalized = normalizePhone(phone);

    // ── المرحلة ١: استعادةٌ بالهاتف (`physicalId: 0` = بحثٌ بالهاتف) ──
    if (targetRoom.isNotEmpty && normalized.isNotEmpty) {
      final ok =
          await rejoin(roomId: targetRoom, physicalId: 0, phone: normalized);
      if (ok) return;
    }

    // ── المرحلة ٢: غرفةٌ نشطة من `/me` ──
    final active = await fetchActiveGame();
    if (active != null) {
      final activeRoom = '${active['roomId'] ?? ''}';
      if (activeRoom.isNotEmpty) {
        if (targetRoom.isEmpty || activeRoom == targetRoom) {
          final ok = await rejoin(
            roomId: activeRoom,
            physicalId: (active['physicalId'] as num?)?.toInt() ?? 0,
            phone: normalized,
          );
          if (ok) return;
        } else {
          // 🔴 غرفةٌ **مختلفة**: لا انضمام صامت — يُسأل اللاعب أوّلاً
          openSwitchConfirm(
            currentRoomId: activeRoom,
            currentRoomName: '${active['gameName'] ?? ''}',
            targetRoomId: targetRoom,
          );
          return;
        }
      }
    }

    // ── المرحلة ٣: انضمامٌ جديد ──
    if (ticketRequired && playerId == 0) {
      setStep(GameStep.ticket);
      return;
    }
    setStep(GameStep.autoJoining);
    // تأخيرٌ صغير كي تستقرّ الحالة قبل النداء
    await Future<void>.delayed(const Duration(milliseconds: 100));
    await autoJoin(roomIdOverride: targetRoom);
  }

  /// 6.4 — الانضمام. **المقعد عشوائيّ بالتصميم**: `preferredSeat` لا
  /// يُرسَل أبداً، والعودة إلى مقعدٍ سابق تمرّ بالاستعادة لا بالانضمام.
  Future<void> autoJoin({
    bool forceJoin = false,
    String? ticket,
    String? roomIdOverride,
  }) async {
    final player = SessionStore.instance.player;
    final name = player?.name ?? '';
    if (name.isEmpty) return; // حارسٌ صامت

    final target = roomIdOverride ?? roomId;
    if (target.isEmpty) {
      setApiError('لم يتم تحديد الغرفة');
      return;
    }

    setStep(GameStep.autoJoining);
    setBusy(true);
    clearApiError();

    final t = (ticket ?? ticketInput).trim();
    final res = await SocketService.instance.ask('room:auto-join', {
      'roomId': target,
      'name': name,
      'phone': normalizePhone(player?.phone),
      if (player != null) 'playerId': player.id,
      if (player?.gender != null) 'gender': player!.gender,
      'forceJoin': forceJoin,
      if (t.isNotEmpty) 'ticketNumber': t,
    });
    setBusy(false);

    if (res != null && res['success'] != false && res['assignedSeat'] != null) {
      await applyJoined(
        roomId: target,
        seat: (res['assignedSeat'] as num).toInt(),
        name: name,
        phone: normalizePhone(player?.phone),
        playerId: player?.id,
        isRemote: res['isRemote'] == true,
        gameName: '${res['gameName'] ?? gameName}',
      );
      return;
    }

    final err = '${res?['error'] ?? ''}';

    // 🔴 استبياناتٌ معلّقة: رسالة الخادم ثمّ تحويلٌ إلى التقييم
    if (res?['code'] == 'PENDING_SURVEYS') {
      setApiError(err.isEmpty
          ? 'يجب إكمال استبيانات فعالياتك السابقة قبل الانضمام'
          : err);
      requestFeedbackRedirect();
      return;
    }

    final isTicketError = err.contains('التذكرة') || err.contains('ticket');

    if (res?['requiresConfirmation'] == true) {
      openJoinConfirmation(err);
      setStep(isTicketError || requireTicket ? GameStep.ticket : GameStep.autoJoining);
      return;
    }

    setApiError(err.isEmpty
        ? (res == null
            ? 'الخادم في وضع قطع الاتصال أو لا يستجيب (Timeout)'
            : 'حدث خطأ في الانضمام')
        : err);
    setStep(isTicketError || requireTicket ? GameStep.ticket : GameStep.autoJoining);
  }

  /// 6.6 — تبديل الغرفة: **يُجمَّد المقعد القديم أوّلاً** فيبقى محجوزاً
  /// لصاحبه إن عاد، ثمّ يُنتقل إلى الهدف.
  Future<void> switchRoom() async {
    final s = switchConfirm;
    if (s == null) return;
    setBusy(true);
    final player = SessionStore.instance.player;

    await SocketService.instance.ask('room:freeze-player', {
      'roomId': s.currentRoomId,
      'phone': normalizePhone(player?.phone),
      if (player != null) 'playerId': player.id,
    });

    await prepareSwitchTo(s.targetRoomId);
    setBusy(false);

    if (requireTicket) {
      setStep(GameStep.ticket);
      return;
    }
    setStep(GameStep.autoJoining);
    await Future<void>.delayed(const Duration(milliseconds: 100));
    await autoJoin(roomIdOverride: s.targetRoomId);
  }

  /// «ابقَ هنا» — استعادةُ الالتحاق بالغرفة الحالية بدل الانتقال.
  Future<void> stayInCurrentRoom() async {
    final s = switchConfirm;
    if (s == null) return;
    setBusy(true);
    final player = SessionStore.instance.player;
    final ok = await rejoin(
      roomId: s.currentRoomId,
      physicalId: 0,
      phone: normalizePhone(player?.phone),
    );
    setBusy(false);
    closeSwitchConfirm();
    if (!ok) setApiError('تعذّرت العودة إلى غرفتك');
  }
}
