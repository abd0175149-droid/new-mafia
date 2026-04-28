// ══════════════════════════════════════════════════════
// 🟢 أحداث اللوبي (Lobby Socket Events)
// المرجع: docs/02_LOBBY_AND_SETUP.md
// ══════════════════════════════════════════════════════

import { Server, Socket } from 'socket.io';
import { createRoom, addPlayer, updatePlayer, updateRoom, getRoom, getRoomByCode, bindRole, unbindRole, setPhase, Phase } from '../game/state.js';
import { generateRoles, validateRoleDistribution, Role, getTeamCounts, isMafiaRole, MAFIA_ROLES } from '../game/roles.js';
import { getGameState, setGameState, deleteGameState } from '../config/redis.js';
import { createMatch } from '../services/match.service.js';
import { createSession, addPlayerToSession, getSessionPlayers, removePlayerFromSession, closeSession, unlinkSessionFromActivity, deleteSession } from '../services/session.service.js';

export const activeRooms: Map<string, { roomId: string; roomCode: string; gameName: string; playerCount: number; maxPlayers: number; displayPin: string }> = new Map();

export function getActiveRooms() {
  return Array.from(activeRooms.values());
}

// ── إعادة بناء activeRooms من Redis عند بدء السيرفر ──
export async function rehydrateActiveRooms(): Promise<void> {
  try {
    const { getAllGameStates } = await import('../config/redis.js');
    const allStates = await getAllGameStates();

    for (const state of allStates) {
      // تخطي الألعاب المنتهية أو البيانات التالفة
      if (!state || !state.roomId || state.phase === 'GAME_OVER') continue;

      activeRooms.set(state.roomId, {
        roomId: state.roomId,
        roomCode: state.roomCode || '',
        gameName: state.config?.gameName || 'Unknown',
        playerCount: state.players?.length || 0,
        maxPlayers: state.config?.maxPlayers || 10,
        displayPin: state.config?.displayPin || '',
      });
    }

    if (activeRooms.size > 0) {
      console.log(`♻️  Rehydrated ${activeRooms.size} active room(s) from Redis`);
    } else {
      console.log(`ℹ️  No active rooms found in Redis to rehydrate`);
    }
  } catch (err) {
    console.error('❌ Failed to rehydrate active rooms:', err);
  }
}

export async function seedDummyGame() {
  try {
    console.log('🌱 Seeding Dummy Game for quick testing from lobby.socket.ts...');
    const state = await createRoom('لعبة تجريبية (Auto Seeded)', 10, 2, '2026');
    console.log('🌱 Room created in Redis:', state.roomId);
    
    const names = ['أحمد', 'محمد', 'علي', 'خالد', 'عمر', 'سارة', 'فاطمة', 'تسنيم', 'ريم', 'نور'];
    const genders: ('MALE'|'FEMALE')[] = ['MALE', 'MALE', 'MALE', 'MALE', 'MALE', 'FEMALE', 'FEMALE', 'FEMALE', 'FEMALE', 'FEMALE'];
    
    for (let i = 0; i < 10; i++) {
      await addPlayer(state.roomId, i + 1, names[i], `070000000${i}`, null);
      await updatePlayer(state.roomId, i + 1, { gender: genders[i], dob: '1995-01-01' });
    }
    console.log('🌱 Players inserted successfully!');

    activeRooms.set(state.roomId, {
      roomId: state.roomId,
      roomCode: state.roomCode,
      gameName: state.config.gameName,
      playerCount: 10,
      maxPlayers: state.config.maxPlayers,
      displayPin: state.config.displayPin || '2026',
    });

    console.log(`✅ Dummy Game seeded successfully. RoomId: ${state.roomId}`);
    console.log(`🎮 Current Active Rooms size now: ${activeRooms.size}`);
  } catch (e) {
    console.error('❌ Failed to seed dummy game:', e);
  }
}

export function registerLobbyEvents(io: Server, socket: Socket) {

  // ── إنشاء غرفة جديدة ──────────────────────────
  socket.on('room:create', async (data: {
    gameName: string;
    maxPlayers?: number;
    maxJustifications?: number;
    displayPin?: string;
    activityId?: number;
    existingSessionId?: number; // إذا موجود = الغرفة منشأة في DB بالفعل
    sessionCode?: string; // كود الجلسة من DB — لتوحيد الكود
  }, callback) => {
    try {
      const gameName = data.gameName || 'لعبة مافيا';
      const maxPlayers = Math.min(Math.max(data.maxPlayers || 10, 6), 27);

      // إذا فيه sessionCode من DB → نستخدمه ككود للغرفة (توحيد الأكواد)
      const overrideCode = data.existingSessionId && data.sessionCode
        ? data.sessionCode
        : undefined;

      const state = await createRoom(
        gameName,
        maxPlayers,
        data.maxJustifications || 2,
        data.displayPin,
        overrideCode,
      );

      let sessionId: number | null = null;

      if (data.existingSessionId) {
        // ── الغرفة موجودة في DB (من واجهة الإدارة) — لا ننشئ session جديد ──
        sessionId = data.existingSessionId;
        state.sessionId = sessionId;
        state.sessionCode = state.roomCode;
        if (data.activityId) {
          state.activityId = data.activityId;
        }
        await setGameState(state.roomId, state);
        console.log(`🔗 Room created using existing Session #${sessionId}`);
      } else {
        // ── إنشاء Session جديد في PostgreSQL ──
        sessionId = await createSession(gameName, state.roomCode, state.config.displayPin, maxPlayers, data.activityId || undefined);
        if (sessionId) {
          state.sessionId = sessionId;
          state.sessionCode = state.roomCode;
          if (data.activityId) {
            state.activityId = data.activityId;
          }
          await setGameState(state.roomId, state);
        }
      }

      // لا يتم إنشاء لاعبين افتراضيين — الليدر يضيفهم يدوياً

      socket.join(state.roomId);
      socket.data.role = 'leader';
      socket.data.roomId = state.roomId;

      // تتبع الغرفة النشطة
      activeRooms.set(state.roomId, {
        roomId: state.roomId,
        roomCode: state.roomCode,
        gameName,
        playerCount: 0,
        maxPlayers,
        displayPin: state.config.displayPin,
      });

      callback({
        success: true,
        roomId: state.roomId,
        roomCode: state.roomCode,
        displayPin: state.config.displayPin,
        gameName,
        sessionId: sessionId || undefined,
        activityId: data.activityId || undefined,
      });
      console.log(`🏠 Room created: ${state.roomId} (code: ${state.roomCode}, session: #${sessionId}, activity: ${data.activityId || 'none'}) — empty, max ${maxPlayers}`);

      // ── إشعار اللاعبين الحاجزين عند وقت النشاط ──
      if (data.activityId) {
        const notifyBookedPlayers = async () => {
          try {
            const { getDB } = await import('../config/db.js');
            const { eq, and, isNotNull } = await import('drizzle-orm');
            const { bookings } = await import('../schemas/admin.schema.js');
            const db = getDB();
            if (!db) return;

            // جلب الحاجزين مع playerId
            const bookedPlayers = await db.select({
              playerId: bookings.playerId,
              name: bookings.name,
            }).from(bookings)
              .where(and(
                eq(bookings.activityId, data.activityId!),
                isNotNull(bookings.playerId),
              ));

            if (bookedPlayers.length === 0) return;

            // إرسال push لكل الحاجزين
            const ids = bookedPlayers.filter(b => b.playerId).map(b => b.playerId!);
            import('../services/fcm.service.js').then(({ sendPushToPlayers }) => {
              sendPushToPlayers(ids,
                '🎮 النشاط بدأ!',
                `${gameName} — ادخل واختر رقم مقعدك الآن!`,
                'activity_started',
                { roomCode: state.roomCode, url: `/player/join?code=${state.roomCode}` }
              );
            }).catch(() => {});

            console.log(`🔔 Notified ${ids.length} booked players for room ${state.roomId}`);
          } catch (err: any) {
            console.error('❌ Notify booked players error:', err.message);
          }
        };

        // ── تحقق من وقت النشاط ──
        try {
          const { getDB } = await import('../config/db.js');
          const { eq: eqOp } = await import('drizzle-orm');
          const { activities } = await import('../schemas/admin.schema.js');
          const db = getDB();
          if (db) {
            const [act] = await db.select({ date: activities.date })
              .from(activities).where(eqOp(activities.id, data.activityId)).limit(1);

            if (act) {
              const actTime = new Date(act.date);
              const now = new Date();

              if (actTime <= now) {
                // الوقت وصل أو مضى → أرسل إشعار فوراً
                notifyBookedPlayers();
              } else {
                // جدول الإشعار عند وقت النشاط
                const delay = actTime.getTime() - now.getTime();
                console.log(`⏰ Scheduled notification for room ${state.roomId} in ${Math.round(delay / 60000)} minutes`);
                setTimeout(notifyBookedPlayers, delay);
              }
            }
          }
        } catch (e) {
          // في حالة خطأ → أرسل إشعار فوراً كـ fallback
          notifyBookedPlayers();
        }
      }
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── قائمة الألعاب النشطة ──────────────────────
  socket.on('room:list-active', (data: any, callback) => {
    const rooms = getActiveRooms().map(r => ({
      roomId: r.roomId,
      roomCode: r.roomCode,
      gameName: r.gameName,
      playerCount: r.playerCount,
      maxPlayers: r.maxPlayers,
    }));
    callback({ success: true, rooms });
  });

  // ── التحقق من PIN شاشة العرض ──────────────────
  socket.on('room:verify-display-pin', async (data: { roomId: string; pin: string }, callback) => {
    try {
      const room = activeRooms.get(data.roomId);
      if (!room) {
        return callback({ success: false, error: 'اللعبة غير موجودة' });
      }

      if (room.displayPin !== data.pin) {
        return callback({ success: false, error: 'الرقم السري غير صحيح' });
      }

      socket.join(data.roomId);
      socket.data.role = 'display';
      socket.data.roomId = data.roomId;

      const state = await getRoom(data.roomId);
      callback({
        success: true,
        gameName: room.gameName,
        roomCode: room.roomCode,
        playerCount: room.playerCount,
        maxPlayers: room.maxPlayers,
        state,
      });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── البحث عن غرفة بالكود ──────────────────────
  socket.on('room:find-by-code', async (data: { roomCode: string }, callback) => {
    try {
      const state = await getRoomByCode(data.roomCode);
      if (!state) {
        return callback({ success: false, error: 'لم يتم العثور على لعبة بهذا الكود' });
      }

      callback({
        success: true,
        roomId: state.roomId,
        roomCode: state.roomCode,
        gameName: state.config.gameName,
        playerCount: state.players.length,
        maxPlayers: state.config.maxPlayers,
        occupiedSeats: state.players.map(p => p.physicalId),
        // أسماء اللاعبين في كل مقعد — لعرضها في واجهة اختيار المقعد
        seatMap: state.players.map(p => ({ seat: p.physicalId, name: p.name })),
      });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── انضمام لاعب ──────────────────────────────
  socket.on('room:join', async (data: {
    roomId: string;
    physicalId: number;
    name: string;
    phone?: string;
    playerId?: number;
    gender?: string;
    dob?: string;
  }, callback) => {
    try {
      // ── حماية: فحص هل اللاعب في غرفة أخرى نشطة ──
      if (data.playerId) {
        const { getAllGameStates } = await import('../config/redis.js');
        const allStates = await getAllGameStates();
        for (const otherState of allStates) {
          if (!otherState || otherState.roomId === data.roomId) continue;
          const existing = otherState.players?.find((p: any) => p.playerId === data.playerId);
          if (existing) {
            if (!existing.isAlive || otherState.phase === 'GAME_OVER') {
              // مُقصى أو اللعبة انتهت → يحتاج يغادر يدوياً
              return callback({ success: false, error: 'أنت في غرفة أخرى، اضغط "مغادرة الغرفة" أولاً' });
            } else {
              // لا يزال حي في لعبة نشطة → امنع الدخول
              return callback({ success: false, error: 'أنت في غرفة أخرى نشطة، غادر أولاً' });
            }
          }
        }
      }

      const state = await addPlayer(
        data.roomId,
        data.physicalId,
        data.name,
        data.phone || null,
        data.playerId || null,
      );

      // البحث عن اللاعب الفعلي (قد يكون تم ربطه بمقعد ليدر موجود)
      const actualPlayer = data.phone
        ? state.players.find(p => p.phone === data.phone) || state.players.find(p => p.physicalId === data.physicalId)
        : state.players.find(p => p.physicalId === data.physicalId);

      const actualPhysicalId = actualPlayer?.physicalId ?? data.physicalId;

      // تحديث الجنس وتاريخ الميلاد إذا تم إرسالها
      if (data.gender || data.dob) {
        await updatePlayer(data.roomId, actualPhysicalId, {
          gender: data.gender || 'MALE',
          dob: data.dob || '2000-01-01',
        });
      }

      // ── جلب صورة اللاعب من قاعدة البيانات وحفظها في Redis ──
      if (data.playerId) {
        try {
          const { getDB } = await import('../config/db.js');
          const { players } = await import('../schemas/player.schema.js');
          const { eq } = await import('drizzle-orm');
          const db = getDB();
          if (db) {
            const [dbPlayer] = await db.select({ avatarUrl: players.avatarUrl })
              .from(players).where(eq(players.id, data.playerId)).limit(1);
            if (dbPlayer?.avatarUrl) {
              await updatePlayer(data.roomId, actualPhysicalId, { avatarUrl: dbPlayer.avatarUrl });
            }
          }
        } catch (e) { /* DB might be unavailable */ }
      }

      socket.join(data.roomId);
      socket.data.role = 'player';
      socket.data.roomId = data.roomId;
      socket.data.physicalId = actualPhysicalId;

      // تحديث العداد
      const room = activeRooms.get(data.roomId);
      if (room) {
        room.playerCount = state.players.length;
      }

      // جلب الحالة المحدثة بعد كل التعديلات
      const updatedState = await getRoom(data.roomId);
      const finalPlayer = updatedState?.players.find((p: any) => p.physicalId === actualPhysicalId);

      // بث للجميع في الغرفة
      io.to(data.roomId).emit('room:player-joined', {
        physicalId: actualPhysicalId,
        name: finalPlayer?.name || actualPlayer?.name || data.name,
        totalPlayers: state.players.length,
        maxPlayers: state.config.maxPlayers,
        gender: data.gender || 'MALE',
        avatarUrl: finalPlayer?.avatarUrl || null,
      });

      callback({ success: true, linkedSeat: actualPhysicalId !== data.physicalId ? actualPhysicalId : undefined });
      console.log(`👤 Player joined: #${actualPhysicalId} - ${actualPlayer?.name || data.name} (${data.gender || 'MALE'})${actualPhysicalId !== data.physicalId ? ' [LINKED to leader seat]' : ''}`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── إعادة اتصال لاعب (Rejoin) ──────────────────
  socket.on('room:rejoin-player', async (data: {
    roomId: string;
    physicalId: number;
    phone?: string;
  }, callback) => {
    try {
      const state = await getRoom(data.roomId);
      if (!state) {
        return callback({ success: false, error: 'Room not found' });
      }

      // البحث عن اللاعب بالرقم الفيزيائي أو رقم الهاتف
      const player = state.players.find((p: any) =>
        p.physicalId === data.physicalId ||
        (data.phone && p.phone === data.phone)
      );

      if (!player) {
        return callback({ success: false, error: 'Player not found in this room' });
      }

      // ── فك التجميد عند العودة ──
      if (player.frozen) {
        player.frozen = false;
        await setGameState(data.roomId, state);
        console.log(`🔓 Player #${player.physicalId} unfrozen in room ${data.roomId}`);
      }

      // ربط الـ socket بالغرفة
      socket.join(data.roomId);
      socket.data.role = 'player';
      socket.data.roomId = data.roomId;
      socket.data.physicalId = player.physicalId;

      // إخفاء الدور إذا لم يتم تأكيد الأدوار بعد
      const shouldShowRole = state.rolesConfirmed || 
        (state.phase !== Phase.ROLE_BINDING && state.phase !== Phase.ROLE_GENERATION && state.phase !== Phase.LOBBY);

      // جمع زملاء المافيا إذا اللاعب مافيا
      let mafiaTeamData: any[] | undefined;
      if (shouldShowRole && player.role && isMafiaRole(player.role as Role)) {
        mafiaTeamData = state.players
          .filter((p: any) => p.role && isMafiaRole(p.role as Role) && p.isAlive !== false && p.physicalId !== player.physicalId)
          .map((p: any) => ({ physicalId: p.physicalId, name: p.name }));
      }

      // بيانات التصويت للاستعادة الفورية عند rejoin
      const votingData = state.phase === Phase.DAY_VOTING && state.votingState?.candidates?.length > 0 ? {
        candidates: state.votingState.candidates,
        totalVotesCast: state.votingState.totalVotesCast,
        playerVotes: state.votingState.playerVotes || {},
        hiddenPlayers: state.votingState.hiddenPlayersFromVoting,
        playersInfo: state.players.filter((p: any) => p.isAlive).map((p: any) => ({
          physicalId: p.physicalId,
          name: p.name,
          avatarUrl: p.avatarUrl || null,
        })),
      } : null;

      callback({
        success: true,
        player: {
          physicalId: player.physicalId,
          name: player.name,
          role: shouldShowRole ? (player.role || null) : null,
          isAlive: player.isAlive,
          gender: player.gender || 'MALE',
          playerId: player.playerId || null,
        },
        mafiaTeam: mafiaTeamData || [],
        phase: state.phase,
        gameName: state.config?.gameName || '',
        roomCode: state.roomCode || '',
        votingState: votingData,
      });

      console.log(`♻️  Player rejoin: #${player.physicalId} - ${player.name} (alive: ${player.isAlive})`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── تجميد لاعب في غرفة (للتنقل بين الغرف) ──────
  socket.on('room:freeze-player', async (data: {
    roomId: string;
    phone?: string;
    playerId?: number;
  }, callback) => {
    try {
      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      // البحث عن اللاعب
      const player = state.players.find((p: any) =>
        (data.playerId && p.playerId === data.playerId) ||
        (data.phone && p.phone === data.phone)
      );

      if (!player) return callback({ success: false, error: 'Player not found' });

      // ── شرط: اللاعب لازم يكون ميت (مُقصى) عشان ينتقل ──
      if (player.isAlive) {
        return callback({ success: false, error: 'لا يمكنك الانتقال إلا بعد إقصائك من اللعبة الحالية' });
      }

      // تجميد اللاعب
      player.frozen = true;
      await setGameState(data.roomId, state);

      // خروج الـ socket من الغرفة القديمة
      socket.leave(data.roomId);

      console.log(`🧊 Player #${player.physicalId} (${player.name}) frozen in room ${data.roomId}`);
      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── صلاحية الليدر: تغيير أرقام اللاعبين جماعياً ──
  socket.on('room:renumber-players', async (data: {
    roomId: string;
    changes: Array<{ oldPhysicalId: number; newPhysicalId: number }>;
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }

      let state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      if (state.phase !== Phase.LOBBY && state.phase !== Phase.ROLE_GENERATION) {
        return callback({ success: false, error: 'لا يمكن تغيير الأرقام بعد بدء اللعبة' });
      }

      // فلترة التغييرات الفعلية فقط
      const actualChanges = data.changes.filter(c => c.oldPhysicalId !== c.newPhysicalId);
      if (actualChanges.length === 0) {
        return callback({ success: true });
      }

      // التحقق من عدم وجود أرقام جديدة مكررة
      const allNewIds = data.changes.map(c => c.newPhysicalId);
      const uniqueNewIds = new Set(allNewIds);
      if (uniqueNewIds.size !== allNewIds.length) {
        return callback({ success: false, error: 'يوجد أرقام مكررة في القائمة الجديدة' });
      }

      // التحقق أن كل الأرقام بين 1-99
      if (allNewIds.some(id => id < 1 || id > 99)) {
        return callback({ success: false, error: 'الأرقام يجب أن تكون بين 1 و 99' });
      }

      // تطبيق التغييرات بأمان (بدون تعارض عند مبادلة الأرقام)
      // بناء خريطة oldId → newId من كل التغييرات
      const idMap = new Map<number, number>();
      for (const change of data.changes) {
        idMap.set(change.oldPhysicalId, change.newPhysicalId);
      }

      // تطبيق دفعة واحدة — كل لاعب يحصل على رقمه الجديد
      for (const player of state.players) {
        const newId = idMap.get(player.physicalId);
        if (newId !== undefined) {
          player.physicalId = newId;
        }
      }

      // إعادة الترتيب حسب الرقم الجديد
      state.players.sort((a, b) => a.physicalId - b.physicalId);

      await setGameState(data.roomId, state);

      // ── إرسال تحديث الرقم لكل لاعب متأثر عبر WebSocket ──
      // نبني خريطة socket → change أولاً لتجنب مشاكل الـ swap
      const allSockets = await io.in(data.roomId).fetchSockets();
      const socketChanges: Array<{ socket: any; oldId: number; newId: number }> = [];
      
      for (const change of actualChanges) {
        for (const s of allSockets) {
          if (s.data.role === 'player' && s.data.physicalId === change.oldPhysicalId) {
            socketChanges.push({ socket: s, oldId: change.oldPhysicalId, newId: change.newPhysicalId });
          }
        }
      }

      // تطبيق التغييرات دفعة واحدة (بعد الانتهاء من البحث)
      for (const sc of socketChanges) {
        sc.socket.data.physicalId = sc.newId;
        sc.socket.emit('player:seat-changed', {
          oldPhysicalId: sc.oldId,
          newPhysicalId: sc.newId,
        });
        console.log(`📤 Seat change notification sent: #${sc.oldId} → #${sc.newId}`);
      }

      // بث التحديث الكامل لكل الشاشات (الآلية الرئيسية للمزامنة)
      io.to(data.roomId).emit('game:state-sync', state);

      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── صلاحية الليدر: تعديل/إضافة لاعب يدوياً ──
  socket.on('room:override-player', async (data: {
    roomId: string;
    physicalId: number;
    name: string;
    newPhysicalId?: number;
    isNew?: boolean;
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader can override' });
      }

      let state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      // ✅ السماح بتعديل الاسم/الرقم فقط قبل توزيع الأدوار
      if (!data.isNew && state.phase !== Phase.LOBBY && state.phase !== Phase.ROLE_GENERATION) {
        return callback({ success: false, error: 'لا يمكن تعديل البيانات بعد توزيع الأدوار' });
      }

      if (data.isNew) {
        state = await addPlayer(data.roomId, data.physicalId, data.name);
      } else {
        // بناء كائن التحديثات
        const updates: any = { name: data.name };

        // ═══ تغيير رقم اللاعب (إن وُجد) ═══
        if (data.newPhysicalId !== undefined && data.newPhysicalId !== data.physicalId) {
          // التحقق من أن الرقم الجديد غير مأخوذ
          const existing = state.players.find(p => p.physicalId === data.newPhysicalId);
          if (existing) {
            return callback({ success: false, error: `الرقم ${data.newPhysicalId} مستخدم من لاعب آخر (${existing.name})` });
          }
          if (data.newPhysicalId < 1 || data.newPhysicalId > 99) {
            return callback({ success: false, error: 'الرقم يجب أن يكون بين 1 و 99' });
          }
          updates.physicalId = data.newPhysicalId;
        }

        state = await updatePlayer(data.roomId, data.physicalId, updates);
      }

      io.to(data.roomId).emit('room:player-updated', {
        physicalId: data.newPhysicalId || data.physicalId,
        oldPhysicalId: data.newPhysicalId ? data.physicalId : undefined,
        name: data.name,
        totalPlayers: state.players.length,
      });

      // ── إرسال تحديث الرقم للاعب المتأثر عبر WebSocket ──
      if (data.newPhysicalId && data.newPhysicalId !== data.physicalId) {
        const allSockets = await io.in(data.roomId).fetchSockets();
        for (const s of allSockets) {
          if (s.data.role === 'player' && s.data.physicalId === data.physicalId) {
            s.data.physicalId = data.newPhysicalId;
            s.emit('player:seat-changed', {
              oldPhysicalId: data.physicalId,
              newPhysicalId: data.newPhysicalId,
            });
            console.log(`📤 Seat change notification sent: #${data.physicalId} → #${data.newPhysicalId}`);
          }
        }
      }

      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── صلاحية الليدر: إضافة لاعب أوفلاين مع كامل البيانات ──
  socket.on('room:force-add-player', async (data: {
    roomId: string;
    physicalId: number;
    name: string;
    phone: string;
    dob: string;
    gender: string;
  }, callback) => {
    try {
      console.log(`[Backend-Socket] room:force-add-player 📥 Received request from leader for room ${data.roomId}`, data);
      
      if (socket.data.role !== 'leader') {
        console.warn(`[Backend-Socket] ❌ Failure: role is ${socket.data.role}, expected 'leader'`);
        return callback({ success: false, error: 'Only leader can override' });
      }

      console.log(`[Backend-Socket] ➡️ Calling addPlayer(${data.roomId}, ${data.physicalId}, ${data.name}, ${data.phone})`);
      const state = await addPlayer(data.roomId, data.physicalId, data.name, data.phone);
      
      console.log(`[Backend-Socket] ➡️ Calling updatePlayer for dob/gender: ${data.dob}, ${data.gender}`);
      await updatePlayer(data.roomId, data.physicalId, { dob: data.dob, gender: data.gender });

      const room = activeRooms.get(data.roomId);
      if (room) {
        room.playerCount = state.players.length;
      }

      console.log(`[Backend-Socket] 📢 Emitting room:player-joined to room ${data.roomId}`);
      io.to(data.roomId).emit('room:player-joined', {
        physicalId: data.physicalId,
        name: data.name,
        totalPlayers: state.players.length,
        maxPlayers: state.config.maxPlayers,
        gender: data.gender || 'MALE',
      });

      console.log(`[Backend-Socket] ✅ Done adding player #${data.physicalId}`);
      callback({ success: true });
    } catch (err: any) {
      console.error(`[Backend-Socket] ❌ Exception in room:force-add-player:`, err.message);
      callback({ success: false, error: err.message });
    }
  });

  // ── صلاحية الليدر: إزالة لاعب ──
  socket.on('room:kick-player', async (data: {
    roomId: string;
    physicalId: number;
  }, callback) => {
    try {
      // Auto-join as leader
      socket.join(data.roomId);
      socket.data.role = 'leader';
      socket.data.roomId = data.roomId;

      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      // Remove player from Redis
      state.players = state.players.filter(p => p.physicalId !== data.physicalId);
      await updateRoom(data.roomId, { players: state.players });

      // Remove from PostgreSQL (session_players)
      if (state.sessionId) {
        await removePlayerFromSession(state.sessionId, data.physicalId);
      }

      const room = activeRooms.get(data.roomId);
      if (room) {
        room.playerCount = state.players.length;
      }

      io.to(data.roomId).emit('room:player-kicked', {
        physicalId: data.physicalId,
        totalPlayers: state.players.length,
      });

      // ── إرسال إشعار للاعب المطرود بشكل مباشر ──
      const allSockets = await io.in(data.roomId).fetchSockets();
      for (const s of allSockets) {
        if (s.data.role === 'player' && s.data.physicalId === data.physicalId) {
          s.emit('player:kicked-self');
          s.leave(data.roomId);
        }
      }

      callback({ success: true });
      console.log(`👑 Leader kicked player: #${data.physicalId}`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── تحديث عدد اللاعبين الأقصى ──────────────────
  socket.on('room:update-max-players', async (data: {
    roomId: string;
    maxPlayers: number;
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }

      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      if (state.phase !== Phase.LOBBY && state.phase !== Phase.GAME_OVER) {
        return callback({ success: false, error: 'يمكن التعديل في اللوبي أو بعد انتهاء اللعبة فقط' });
      }

      const newMax = Math.min(Math.max(data.maxPlayers, 6), 50);
      const oldMax = state.config.maxPlayers;

      if (newMax === oldMax) {
        return callback({ success: true });
      }

      state.config.maxPlayers = newMax;

      if (newMax > oldMax) {
        // فقط تحديث الإعدادات — لا يتم إنشاء لاعبين افتراضيين
        await updateRoom(data.roomId, { config: state.config });
      } else {
        // حذف اللاعبين الزائدين من النهاية
        for (let i = oldMax; i > newMax; i--) {
          const player = state.players.find((p: any) => p.physicalId === i);
          if (player) {
            state.players = state.players.filter((p: any) => p.physicalId !== i);
            io.to(data.roomId).emit('room:player-kicked', {
              physicalId: i,
              totalPlayers: state.players.length,
            });
          }
        }
      }

      await updateRoom(data.roomId, { players: state.players, config: state.config });

      const room = activeRooms.get(data.roomId);
      if (room) {
        room.playerCount = state.players.length;
        room.maxPlayers = newMax;
      }

      // بث تحديث الـ config
      io.to(data.roomId).emit('room:config-updated', {
        maxPlayers: newMax,
      });

      callback({ success: true, maxPlayers: newMax });
      console.log(`👑 Leader updated maxPlayers: ${oldMax} → ${newMax}`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── بدء توليد الأدوار ──────────────────────────
  socket.on('room:start-generation', async (data: { roomId: string }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader can start generation' });
      }

      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      const playerCount = state.players.length;
      if (playerCount < 6) {
        return callback({ success: false, error: 'يجب أن يكون هناك 6 لاعبين على الأقل' });
      }

      const generated = generateRoles(playerCount);
      await setPhase(data.roomId, Phase.ROLE_GENERATION);
      io.to(data.roomId).emit('game:phase-changed', { phase: Phase.ROLE_GENERATION });

      socket.emit('setup:roles-generated', {
        mafiaRoles: generated.mafiaRoles,
        citizenRoles: generated.citizenRoles,
        totalMafia: generated.totalMafia,
        totalCitizens: generated.totalCitizens,
      });

      callback({ success: true });
      console.log(`🎲 Roles generated for ${playerCount} players`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── اعتماد الأدوار النهائية ──────────────────────
  socket.on('setup:roles-confirmed', async (data: {
    roomId: string;
    roles: Role[];
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader can confirm roles' });
      }

      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      const aliveCount = state.players.filter((p: any) => p.isAlive !== false).length;
      const validation = validateRoleDistribution(data.roles, aliveCount);
      if (!validation.valid) {
        return callback({ success: false, error: validation.error });
      }

      await updateRoom(data.roomId, { phase: Phase.ROLE_BINDING, rolesPool: data.roles });
      io.to(data.roomId).emit('game:phase-changed', { phase: Phase.ROLE_BINDING });

      socket.emit('setup:binding-start', {
        players: state.players.map(p => ({ physicalId: p.physicalId, name: p.name })),
        roles: data.roles,
      });

      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── ربط دور بلاعب (Drag & Drop) ──────────────────
  socket.on('setup:bind-role', async (data: {
    roomId: string;
    physicalId: number;
    role: Role;
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader can bind roles' });
      }

      await bindRole(data.roomId, data.physicalId, data.role);
      callback({ success: true });
      console.log(`🔗 Role bound: #${data.physicalId} → ${data.role}`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── إلغاء ربط دور من لاعب (Unbind) ──────────────
  socket.on('setup:unbind-role', async (data: {
    roomId: string;
    physicalId: number;
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader can unbind roles' });
      }

      await unbindRole(data.roomId, data.physicalId);
      callback({ success: true });
      console.log(`🔓 Role unbound: #${data.physicalId}`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── توزيع عشوائي كامل للأدوار (Digital Distribution) ──
  socket.on('setup:random-assign', async (data: { roomId: string }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }

      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });
      if (state.phase !== Phase.ROLE_BINDING) {
        return callback({ success: false, error: 'ليس في مرحلة توزيع الأدوار' });
      }

      const pool = [...(state.rolesPool || [])];
      const alivePlayers = state.players.filter((p: any) => p.isAlive !== false);

      if (pool.length !== alivePlayers.length) {
        return callback({ success: false, error: `عدد الأدوار (${pool.length}) لا يطابق عدد اللاعبين (${alivePlayers.length})` });
      }

      // 1. إلغاء ربط جميع الأدوار الحالية
      for (const p of alivePlayers) {
        if (p.role) {
          await unbindRole(data.roomId, p.physicalId);
        }
      }

      // 2. خلط عشوائي (Fisher-Yates)
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }

      // 3. ربط كل دور بلاعب
      for (let i = 0; i < alivePlayers.length; i++) {
        await bindRole(data.roomId, alivePlayers[i].physicalId, pool[i]);
      }

      // 4. قراءة الحالة المحدثة
      const updatedState = await getRoom(data.roomId);

      // 5. إعادة تعيين حالة التأكيد (لأن الأدوار تغيرت)
      if (updatedState) {
        updatedState.rolesConfirmed = false;
        await setGameState(data.roomId, updatedState);
      }

      // ملاحظة: لا نرسل الأدوار للاعبين هنا — ننتظر حتى يضغط الليدر على "تأكيد الأدوار"

      // 6. إرسال الحالة المحدثة لليدر
      callback({
        success: true,
        state: updatedState,
      });
      console.log(`🎲 Random role assignment complete in room ${data.roomId} — ${alivePlayers.length} players (awaiting confirmation)`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── تأكيد الأدوار وبثها للاعبين ──────────────────
  socket.on('setup:confirm-roles', async (data: { roomId: string }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader can confirm roles' });
      }

      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });
      if (state.phase !== Phase.ROLE_BINDING) {
        return callback({ success: false, error: 'ليس في مرحلة توزيع الأدوار' });
      }

      // التأكد أن كل الأدوار الخاصة موزعة
      const unassignedSpecial = state.players.filter(
        (p: any) => p.isAlive !== false && !p.role && 
        (state.rolesPool || []).some((r: string) => r !== 'CITIZEN')
      );
      // جمع قائمة لاعبي المافيا (أرقام المقاعد) لإرسالها لأعضاء الفريق
      const mafiaPlayers = state.players
        .filter((p: any) => p.role && isMafiaRole(p.role as Role) && p.isAlive !== false)
        .map((p: any) => ({ physicalId: p.physicalId, name: p.name }));

      // بث الدور لكل لاعب متصل على جهازه فقط
      const allSockets = await io.in(data.roomId).fetchSockets();
      for (const s of allSockets) {
        if (s.data.role === 'player' && s.data.physicalId) {
          const player = state.players.find(
            (p: any) => p.physicalId === s.data.physicalId
          );
          if (player?.role) {
            const roleData: any = {
              physicalId: player.physicalId,
              role: player.role,
            };
            // إذا اللاعب من فريق المافيا → أرسل أرقام زملائه
            if (isMafiaRole(player.role as Role)) {
              roleData.mafiaTeam = mafiaPlayers
                .filter((m: any) => m.physicalId !== player.physicalId)
                .map((m: any) => ({ physicalId: m.physicalId, name: m.name }));
            }
            s.emit('player:role-assigned', roleData);
          }
        }
      }

      // تحديث حالة التأكيد
      state.rolesConfirmed = true;
      await setGameState(data.roomId, state);

      callback({ success: true });
      console.log(`✅ Roles confirmed and sent to players in room ${data.roomId}`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── جلب دور اللاعب (Polling fallback) ──────────────
  socket.on('room:get-my-role', async (data: { roomId: string; physicalId: number }, callback) => {
    try {
      const state = await getRoom(data.roomId);
      if (!state) return callback({ role: null, confirmed: false });

      const player = state.players.find((p: any) => p.physicalId === data.physicalId);
      const response: any = {
        role: player?.role || null,
        confirmed: state.rolesConfirmed || false,
      };
      // إذا اللاعب مافيا → أرسل أرقام زملائه
      if (player?.role && isMafiaRole(player.role as Role)) {
        response.mafiaTeam = state.players
          .filter((p: any) => p.role && isMafiaRole(p.role as Role) && p.isAlive !== false && p.physicalId !== player.physicalId)
          .map((p: any) => ({ physicalId: p.physicalId, name: p.name }));
      }
      callback(response);
    } catch {
      callback({ role: null, confirmed: false });
    }
  });

  // ── جلب حالة اللاعب الكاملة بناءً على playerId أو phone (مش physicalId!) ──
  // هذا هو الـ endpoint الموثوق — يبحث بمعرف ثابت ويرجع الرقم الحالي
  socket.on('room:get-my-state', async (data: {
    roomId: string;
    playerId?: number;
    phone?: string;
  }, callback) => {
    try {
      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      // البحث بـ playerId أولاً (الأوثق) ثم بالهاتف
      let player = data.playerId
        ? state.players.find((p: any) => p.playerId === data.playerId)
        : null;
      
      if (!player && data.phone) {
        player = state.players.find((p: any) => p.phone === data.phone);
      }

      if (!player) {
        return callback({ success: false, error: 'Player not found' });
      }

      const shouldShowRole = state.rolesConfirmed ||
        (state.phase !== 'LOBBY' && state.phase !== 'ROLE_BINDING' && state.phase !== 'ROLE_GENERATION');

      // بيانات التصويت إذا كنا في مرحلة التصويت
      const votingData = state.phase === 'DAY_VOTING' && state.votingState?.candidates?.length > 0 ? {
        candidates: state.votingState.candidates,
        totalVotesCast: state.votingState.totalVotesCast,
        playerVotes: state.votingState.playerVotes || {},
        hiddenPlayers: state.votingState.hiddenPlayersFromVoting,
        playersInfo: state.players.filter((p: any) => p.isAlive).map((p: any) => ({
          physicalId: p.physicalId,
          name: p.name,
          avatarUrl: p.avatarUrl || null,
        })),
      } : null;

      callback({
        success: true,
        player: {
          physicalId: player.physicalId,
          name: player.name,
          role: shouldShowRole ? (player.role || null) : null,
          isAlive: player.isAlive,
          gender: player.gender || 'MALE',
          playerId: player.playerId || null,
        },
        phase: state.phase,
        rolesConfirmed: state.rolesConfirmed || false,
        votingState: votingData,
        // بيانات التبرير (لاستعادة الـ UI عند reconnect)
        justificationData: state.phase === 'DAY_JUSTIFICATION' ? state.justificationData || null : null,
        // حالة سحب الأصوات
        withdrawalState: state.phase === 'DAY_JUSTIFICATION' ? (state.withdrawalState || null) : null,
        // حالة النقاش
        discussionState: state.phase === 'DAY_DISCUSSION' ? state.discussionState || null : null,
        // بيانات الإقصاء المعلّقة (لاستعادة شاشة الإقصاء عند reconnect)
        pendingResolution: state.phase === 'DAY_ELIMINATION' ? state.pendingResolution || null : null,
        // نتيجة اللعبة
        winner: state.phase === 'GAME_OVER' ? state.winner || null : null,
        // كشف أدوار الجميع عند انتهاء اللعبة
        allPlayers: state.phase === 'GAME_OVER' ? state.players.map((p: any) => ({
          physicalId: p.physicalId,
          name: p.name,
          role: p.role,
          isAlive: p.isAlive,
        })) : null,
        // معلومات اللاعبين الأحياء (لأسماء المتهمين)
        playersInfo: state.players.filter((p: any) => p.isAlive).map((p: any) => ({
          physicalId: p.physicalId,
          name: p.name,
        })),
      });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── إنهاء الربط وبدء اللعبة ──────────────────────
  socket.on('setup:binding-complete', async (data: { roomId: string }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader can complete binding' });
      }

      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      // ── شرط: يجب تأكيد الأدوار أولاً ──
      if (!state.rolesConfirmed) {
        return callback({ success: false, error: 'يجب تأكيد الأدوار أولاً قبل بدء اللعبة' });
      }


      const unboundPlayers = state.players.filter(p => !p.role && p.isAlive !== false);
      if (unboundPlayers.length > 0) {
        // Calculate remaining roles in the pool
        const pool = [...(state.rolesPool || [])];
        for (const p of state.players) {
           if (p.role) {
             const idx = pool.indexOf(p.role);
             if (idx !== -1) pool.splice(idx, 1);
           }
        }
        
        // Are ALL remaining roles 'CITIZEN'? (Only Citizens can be auto-assigned)
        const nonCitizenRoles = pool.filter(r => r !== Role.CITIZEN);
        if (nonCitizenRoles.length > 0) {
           return callback({
               success: false,
               error: `يجب توزيع الأدوار المميزة والمافيا كلياً. المتبقي: ${nonCitizenRoles.join(', ')}`,
           });
        }
        
        if (pool.length !== unboundPlayers.length) {
            return callback({ success: false, error: 'عدد الأدوار المتبقية لا يطابق عدد اللاعبين غير المربوطين.' });
        }
        
        // Auto-assign remaining CITIZEN roles
        for (let i = 0; i < unboundPlayers.length; i++) {
           await bindRole(data.roomId, unboundPlayers[i].physicalId, Role.CITIZEN);
        }
        
        // Refresh state object with the updated roles from memory
        Object.assign(state, await getRoom(data.roomId));
        console.log(`🤖 Auto-bound ${unboundPlayers.length} citizens in room ${data.roomId}`);
      }

      // ── حفظ وقت البداية + إنشاء سجل المباراة في PostgreSQL ──
      state.startedAt = new Date().toISOString();
      state.round = 1;
      const matchId = await createMatch(state);
      if (matchId) state.matchId = matchId;

      // ── تغيير المرحلة قبل الحفظ والبث ──
      state.phase = Phase.DAY_DISCUSSION;
      await setGameState(data.roomId, state);
      await setPhase(data.roomId, Phase.DAY_DISCUSSION);

      io.to(data.roomId).emit('game:phase-changed', {
        phase: Phase.DAY_DISCUSSION,
        state,
        teamCounts: getTeamCounts(state.players),
      });

      io.to(data.roomId).emit('game:started', {
        round: 1,
        phase: Phase.DAY_DISCUSSION,
        playerCount: state.players.length,
        teamCounts: getTeamCounts(state.players),
      });

      callback({ success: true });
      console.log(`🎮 Game started in room ${data.roomId}!`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── شاشة العرض تنضم للغرفة (بعد التحقق من PIN عبر REST) ──
  socket.on('display:join-room', async (data: { roomId: string }, callback?: any) => {
    if (data.roomId) {
      socket.join(data.roomId);
      socket.data.role = 'display';
      socket.data.roomId = data.roomId;
      console.log(`📺 Display joined room: ${data.roomId}`);

      // إرجاع الحالة الحالية للعرض الفوري
      if (typeof callback === 'function') {
        try {
          const state = await getRoom(data.roomId);
          callback({ success: true, state });
        } catch {
          callback({ success: true });
        }
      }
    }
  });

  // ── الليدر يستعيد الغرفة بعد إعادة الاتصال ──
  socket.on('room:rejoin-leader', (data: { roomId: string }) => {
    if (data.roomId) {
      socket.join(data.roomId);
      socket.data.role = 'leader';
      socket.data.roomId = data.roomId;
      console.log(`👑 Leader rejoined room: ${data.roomId}`);
    }
  });
  // ── خروج اللاعب من الغرفة (EXIT button) ─────────────
  socket.on('room:player-exit', async (data: {
    roomId: string;
    phone?: string;
    playerId?: number;
  }, callback) => {
    try {
      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      // البحث عن اللاعب
      const normalizedPhone = data.phone?.startsWith('0') ? data.phone : (data.phone ? '0' + data.phone : '');
      const playerIndex = state.players.findIndex((p: any) =>
        (data.playerId && p.playerId === data.playerId) ||
        (normalizedPhone && p.phone === normalizedPhone)
      );

      if (playerIndex === -1) return callback({ success: false, error: 'Player not found' });

      const player = state.players[playerIndex];
      const playerName = player.name;
      const playerPhysId = player.physicalId;

      // حذف اللاعب من المصفوفة
      state.players.splice(playerIndex, 1);
      await setGameState(data.roomId, state);

      // إبلاغ الليدر والشاشات
      io.to(data.roomId).emit('game:state-sync', state);
      socket.leave(data.roomId);

      console.log(`🚪 Player #${playerPhysId} (${playerName}) exited room ${data.roomId}`);
      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── إغلاق الغرفة (Soft Close — للوبي فقط) ────────────────
  socket.on('room:close', async (data: { roomId: string }, callback) => {
    try {
      // Auto-join as leader
      socket.join(data.roomId);
      socket.data.role = 'leader';
      socket.data.roomId = data.roomId;

      const state = await getGameState(data.roomId);

      await setPhase(data.roomId, Phase.GAME_OVER);
      activeRooms.delete(data.roomId);

      // حفظ حالة الإغلاق في PostgreSQL
      if (state?.sessionId) {
        await closeSession(state.sessionId);
      }
      
      io.to(data.roomId).emit('game:closed');

      callback({ success: true });
      console.log(`🔒 Room closed manually: ${data.roomId} (session #${state?.sessionId || 'none'})`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── حذف الغرفة نهائياً ─────────────────────────
  socket.on('room:delete-room', async (data: { roomId: string }, callback) => {
    try {
      // Auto-join as leader for this operation
      socket.join(data.roomId);
      socket.data.role = 'leader';
      socket.data.roomId = data.roomId;

      const state = await getGameState(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      const sessionId = state.sessionId;
      const activityId = state.activityId;

      // 1. حذف من Redis
      await deleteGameState(data.roomId);
      // حذف code mapping
      if (state.roomCode) {
        await deleteGameState(`code:${state.roomCode}`);
      }

      // 2. حذف من activeRooms
      activeRooms.delete(data.roomId);

      // 3. معالجة PostgreSQL
      if (sessionId) {
        if (activityId) {
          // غرفة مرتبطة بنشاط → soft delete + فك ربط
          await closeSession(sessionId);
          await unlinkSessionFromActivity(sessionId);
          console.log(`🔒 Room ${data.roomId} soft-deleted (linked to activity #${activityId})`);
        } else {
          // غرفة مستقلة → حذف حقيقي
          await deleteSession(sessionId);
          console.log(`🗑️ Room ${data.roomId} permanently deleted (session #${sessionId})`);
        }
      }

      // 4. إعلام الجميع
      io.to(data.roomId).emit('game:room-deleted');

      callback({ success: true });
      console.log(`🗑️ Room ${data.roomId} deleted by leader`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── دالة مشتركة: إعادة تعيين حالة الغرفة للوبي ──
  function resetRoomState(state: any, excludeIds: number[] = []): any {
    // فلترة المستبعدين وإعادة تعيين الباقين
    const activePlayers = excludeIds.length > 0
      ? state.players.filter((p: any) => !excludeIds.includes(p.physicalId))
      : state.players;

    state.players = activePlayers.map((p: any) => ({
      ...p,
      isAlive: true,
      isSilenced: false,
      role: null,
      justificationCount: 0,
    }));

    state.phase = Phase.LOBBY;
    state.round = 0;
    state.winner = null;
    state.pendingWinner = null;
    state.rolesPool = [];
    state.morningEvents = [];
    state.discussionState = null;
    state.rolesConfirmed = false;
    state.matchId = undefined;
    state.startedAt = undefined;
    state.votingState = {
      totalVotesCast: 0,
      deals: [],
      candidates: [],
      hiddenPlayersFromVoting: [],
      tieBreakerLevel: 0,
      playerVotes: {},
    };
    state.nightActions = {
      godfatherTarget: null,
      silencerTarget: null,
      sheriffTarget: null,
      sheriffResult: null,
      doctorTarget: null,
      sniperTarget: null,
      nurseTarget: null,
      lastProtectedTarget: null,
    };

    return state;
  }

  // ── إعادة الغرفة لحالة اللوبي (بعد GAME_OVER) ────────────
  socket.on('room:reset-to-lobby', async (data: { roomId: string }, callback) => {
    try {
      // Auto-join as leader
      socket.join(data.roomId);
      socket.data.role = 'leader';
      socket.data.roomId = data.roomId;

      const state = await getGameState(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      resetRoomState(state);
      await setGameState(data.roomId, state);

      io.to(data.roomId).emit('game:phase-changed', { phase: 'LOBBY', state });

      callback({ success: true, players: state.players });
      console.log(`🔄 Room ${data.roomId} reset to LOBBY with ${state.players.length} players`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── عرض إعادة نتيجة لعبة سابقة على شاشة Display ────────────
  socket.on('display:show-replay', async (data: { roomId: string; matchId: number }, callback?) => {
    try {
      const { getMatchDetails } = await import('../services/match.service.js');
      const match = await getMatchDetails(data.matchId);
      if (!match) {
        return callback?.({ success: false, error: 'Match not found' });
      }
      // بث النتيجة لشاشة العرض
      io.to(data.roomId).emit('display:replay-result', {
        matchId: match.id,
        winner: match.winner,
        players: match.players,
        durationFormatted: match.durationFormatted,
        gameName: match.gameName,
      });
      callback?.({ success: true });
    } catch (err: any) {
      callback?.({ success: false, error: err.message });
    }
  });

  // ── إخفاء إعادة النتيجة من شاشة Display ────────────
  socket.on('display:hide-replay', (data: { roomId: string }, callback?) => {
    io.to(data.roomId).emit('display:replay-hidden');
    callback?.({ success: true });
  });

  // ── لعبة جديدة في نفس الغرفة — reset بدل create ────────────
  socket.on('room:new-game', async (data: { 
    roomId: string; 
    excludePlayerIds?: number[];
  }, callback) => {
    try {
      // Auto-join as leader
      socket.join(data.roomId);
      socket.data.role = 'leader';
      socket.data.roomId = data.roomId;

      const state = await getGameState(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      const excludeIds = data.excludePlayerIds || [];

      // حذف المستبعدين من PostgreSQL
      if (state.sessionId && excludeIds.length > 0) {
        for (const pid of excludeIds) {
          await removePlayerFromSession(state.sessionId, pid);
        }
      }

      // إعادة تعيين الحالة باستخدام الدالة المشتركة
      resetRoomState(state, excludeIds);
      await setGameState(data.roomId, state);

      // تحديث عدد اللاعبين في activeRooms
      const room = activeRooms.get(data.roomId);
      if (room) {
        room.playerCount = state.players.length;
      }

      // إعلام الجميع بالتحول للوبي
      io.to(data.roomId).emit('game:phase-changed', { phase: 'LOBBY', state });

      callback({
        success: true,
        roomId: state.roomId,
        roomCode: state.roomCode,
        displayPin: state.config.displayPin,
        players: state.players,
      });

      console.log(`🔄 Room ${data.roomId} reset for new game (session #${state.sessionId}) with ${state.players.length} players (excluded: ${excludeIds.length})`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── تنظيف عند قطع الاتصال ─────────────────────
  socket.on('disconnect', () => {
    if (socket.data.role === 'leader' && socket.data.roomId) {
      console.log(`⚠️ Leader disconnected from room ${socket.data.roomId}`);
    }
    if (socket.data.role === 'display' && socket.data.roomId) {
      console.log(`⚠️ Display disconnected from room ${socket.data.roomId}`);
    }
  });
}
