// ══════════════════════════════════════════════════════
// 🟢 أحداث اللوبي (Lobby Socket Events)
// المرجع: docs/02_LOBBY_AND_SETUP.md
// ══════════════════════════════════════════════════════

import { Server, Socket } from 'socket.io';
import { createRoom, addPlayer, updatePlayer, updateRoom, getRoom, getRoomByCode, bindRole, unbindRole, setPhase, Phase } from '../game/state.js';
import { generateRoles, validateRoleDistribution, Role, getTeamCounts } from '../game/roles.js';
import { getGameState, setGameState } from '../config/redis.js';
import { createMatch } from '../services/match.service.js';
import { createSession, addPlayerToSession, getSessionPlayers } from '../services/session.service.js';

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
  }, callback) => {
    try {
      const gameName = data.gameName || 'لعبة مافيا';
      const maxPlayers = Math.min(Math.max(data.maxPlayers || 10, 6), 27);

      const state = await createRoom(
        gameName,
        maxPlayers,
        data.maxJustifications || 2,
        data.displayPin,
      );

      // إنشاء Session في PostgreSQL (مع ربط النشاط إن وُجد)
      const sessionId = await createSession(gameName, state.roomCode, state.config.displayPin, maxPlayers, data.activityId || undefined);
      if (sessionId) {
        state.sessionId = sessionId;
        state.sessionCode = state.roomCode;
        if (data.activityId) {
          state.activityId = data.activityId;
        }
        await setGameState(state.roomId, state);
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
      const state = await addPlayer(
        data.roomId,
        data.physicalId,
        data.name,
        data.phone || null,
        data.playerId || null,
      );

      // تحديث الجنس وتاريخ الميلاد إذا تم إرسالها
      if (data.gender || data.dob) {
        await updatePlayer(data.roomId, data.physicalId, {
          gender: data.gender || 'MALE',
          dob: data.dob || '2000-01-01',
        });
      }

      socket.join(data.roomId);
      socket.data.role = 'player';
      socket.data.roomId = data.roomId;
      socket.data.physicalId = data.physicalId;

      // تحديث العداد
      const room = activeRooms.get(data.roomId);
      if (room) {
        room.playerCount = state.players.length;
      }

      // بث للجميع في الغرفة
      io.to(data.roomId).emit('room:player-joined', {
        physicalId: data.physicalId,
        name: data.name,
        totalPlayers: state.players.length,
        maxPlayers: state.config.maxPlayers,
        gender: data.gender || 'MALE',
      });

      callback({ success: true });
      console.log(`👤 Player joined: #${data.physicalId} - ${data.name} (${data.gender || 'MALE'})`);
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

      // ربط الـ socket بالغرفة
      socket.join(data.roomId);
      socket.data.role = 'player';
      socket.data.roomId = data.roomId;
      socket.data.physicalId = player.physicalId;

      callback({
        success: true,
        player: {
          physicalId: player.physicalId,
          name: player.name,
          role: player.role || null,
          isAlive: player.isAlive,
          gender: player.gender || 'MALE',
        },
        phase: state.phase,
        gameName: state.config?.gameName || '',
        roomCode: state.roomCode || '',
      });

      console.log(`♻️  Player rejoin: #${player.physicalId} - ${player.name} (alive: ${player.isAlive})`);
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

      // بث التحديث الكامل لكل الشاشات
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
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader can kick' });
      }

      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      // Remove player
      state.players = state.players.filter(p => p.physicalId !== data.physicalId);
      await updateRoom(data.roomId, { players: state.players });

      const room = activeRooms.get(data.roomId);
      if (room) {
        room.playerCount = state.players.length;
      }

      io.to(data.roomId).emit('room:player-kicked', {
        physicalId: data.physicalId,
        totalPlayers: state.players.length,
      });

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

      // بث الدور لكل لاعب متصل على جهازه فقط
      const allSockets = await io.in(data.roomId).fetchSockets();
      for (const s of allSockets) {
        if (s.data.role === 'player' && s.data.physicalId) {
          const player = state.players.find(
            (p: any) => p.physicalId === s.data.physicalId
          );
          if (player?.role) {
            s.emit('player:role-assigned', {
              physicalId: player.physicalId,
              role: player.role,
            });
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
      callback({
        role: player?.role || null,
        confirmed: state.rolesConfirmed || false,
      });
    } catch {
      callback({ role: null, confirmed: false });
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
      await setGameState(data.roomId, state);

      await setPhase(data.roomId, Phase.DAY_DISCUSSION);
      io.to(data.roomId).emit('game:phase-changed', { phase: Phase.DAY_DISCUSSION });

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
  socket.on('display:join-room', (data: { roomId: string }) => {
    if (data.roomId) {
      socket.join(data.roomId);
      socket.data.role = 'display';
      socket.data.roomId = data.roomId;
      console.log(`📺 Display joined room: ${data.roomId}`);
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

  // ── إغلاق الغرفة (Soft Delete) ────────────────
  socket.on('room:close', async (data: { roomId: string }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader can close the room' });
      }

      await setPhase(data.roomId, Phase.GAME_OVER);
      activeRooms.delete(data.roomId);
      
      io.to(data.roomId).emit('game:closed');

      callback({ success: true });
      console.log(`🔒 Room closed manually: ${data.roomId}`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── إعادة الغرفة لحالة اللوبي (بعد GAME_OVER) ────────────
  socket.on('room:reset-to-lobby', async (data: { roomId: string }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }

      const state = await getGameState(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      // إعادة تعيين اللاعبين
      state.players = state.players.map(p => ({
        ...p,
        isAlive: true,
        isSilenced: false,
        role: null,
        justificationCount: 0,
      }));

      // إعادة تعيين حالة الغرفة
      state.phase = Phase.LOBBY;
      state.round = 0;
      state.winner = null;
      state.rolesPool = [];
      state.morningEvents = [];
      state.discussionState = null;
      state.votingState = {
        totalVotesCast: 0,
        deals: [],
        candidates: [],
        hiddenPlayersFromVoting: [],
        tieBreakerLevel: 0,
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

      await setGameState(data.roomId, state);

      io.to(data.roomId).emit('game:phase-changed', { phase: 'LOBBY' });

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
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }

      const state = await getGameState(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      const excludeIds = data.excludePlayerIds || [];

      // حذف المستبعدين وإعادة تعيين الباقين
      const activePlayers = state.players.filter(p => !excludeIds.includes(p.physicalId));
      state.players = activePlayers.map(p => ({
        ...p,
        isAlive: true,
        isSilenced: false,
        role: null,
        justificationCount: 0,
      }));

      // إعادة تعيين حالة الغرفة — نفس roomId + roomCode + displayPin
      state.phase = Phase.LOBBY;
      state.round = 0;
      state.winner = null;
      state.rolesPool = [];
      state.morningEvents = [];
      state.discussionState = null;
      state.votingState = {
        totalVotesCast: 0,
        deals: [],
        candidates: [],
        hiddenPlayersFromVoting: [],
        tieBreakerLevel: 0,
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

      await setGameState(data.roomId, state);

      // تحديث عدد اللاعبين في activeRooms
      const room = activeRooms.get(data.roomId);
      if (room) {
        room.playerCount = state.players.length;
      }

      // إعلام الجميع بالتحول للوبي
      io.to(data.roomId).emit('game:phase-changed', { phase: 'LOBBY' });

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
