// ══════════════════════════════════════════════════════
// 🗄️ إدارة الحالة الحية (Game State Manager)
// المرجع: docs/05_SYSTEM_ARCHITECTURE.md
// ══════════════════════════════════════════════════════

import { v4 as uuidv4 } from 'uuid';
import { getGameState, setGameState, deleteGameState } from '../config/redis.js';
import { Role } from './roles.js';

// ── الأنواع (Types) ────────────────────────────────

export enum Phase {
  LOBBY = 'LOBBY',
  ROLE_GENERATION = 'ROLE_GENERATION',
  ROLE_BINDING = 'ROLE_BINDING',
  DAY_DISCUSSION = 'DAY_DISCUSSION',
  DAY_VOTING = 'DAY_VOTING',
  DAY_JUSTIFICATION = 'DAY_JUSTIFICATION',
  DAY_TIEBREAKER = 'DAY_TIEBREAKER',
  NIGHT = 'NIGHT',
  MORNING_RECAP = 'MORNING_RECAP',
  GAME_OVER = 'GAME_OVER',
}

export interface Player {
  physicalId: number;
  name: string;
  phone: string | null;
  dob?: string | null;
  gender?: string | null;
  playerId: number | null;
  role: Role | null;
  isAlive: boolean;
  isSilenced: boolean;
  justificationCount: number; // عدد مرات التبرير في الجولة الحالية
  addedBy?: 'self' | 'leader'; // من أضاف اللاعب: اللاعب نفسه أو الليدر
  frozen?: boolean; // مجمد — انتقل لغرفة أخرى مؤقتاً (بياناته محفوظة)
  avatarUrl?: string | null; // رابط صورة اللاعب الشخصية
}

export enum CandidateType {
  PLAYER = 'PLAYER',
  DEAL = 'DEAL',
}

export interface PlayerCandidate {
  type: CandidateType.PLAYER;
  targetPhysicalId: number;
  votes: number;
}

export interface Deal {
  id: string;
  initiatorPhysicalId: number;
  targetPhysicalId: number;
}

export interface DealCandidate {
  type: CandidateType.DEAL;
  id: string;
  initiatorPhysicalId: number;
  targetPhysicalId: number;
  votes: number;
}

export enum SpeakerStatus {
  WAITING = 'WAITING',   // الدور عند اللاعب لكن الوقت لم يبدأ (ينتظر إذن الليدر)
  SPEAKING = 'SPEAKING', // الوقت قيد الاحتساب
  PAUSED = 'PAUSED',     // الليدر قام بإيقاف الوقت مؤقتاً
}

export interface DiscussionState {
  currentSpeakerId: number | null; // رقم اللاعب المتحدث حالياً (أو المسكت)
  timeLimitSeconds: number;        // سقف الوقت الأصلي
  timeRemaining: number;           // الوقت المتبقي (يُستخدم لحفظ التوقيت عند الإيقاف المؤقت)
  startTime: number | null;        // لتزامن العدادات عبر الشبكة (Unix Timestamp)
  status: SpeakerStatus;
  speakingQueue: number[];         // مصفوفة من اللاعبين المتبقين للتحدث (بما فيهم المسكتون)
  hasSpoken: number[];             // مصفوفة من اللاعبين الذين انتهوا
  isFinished: boolean;             // يعلن انتهاء مرحلة النقاش
}

export type Candidate = PlayerCandidate | DealCandidate;

export interface VotingState {
  totalVotesCast: number;
  deals: Deal[]; // Staged deals before voting starts
  candidates: Candidate[];
  hiddenPlayersFromVoting: number[];
  tieBreakerLevel: number;
}

export interface NightActions {
  godfatherTarget: number | null;
  silencerTarget: number | null;
  sheriffTarget: number | null;
  sheriffResult: string | null;
  doctorTarget: number | null;
  sniperTarget: number | null;
  nurseTarget: number | null;
  lastProtectedTarget: number | null;
}

export interface MorningEvent {
  type: 'ASSASSINATION' | 'ASSASSINATION_BLOCKED' | 'PROTECTION_FAILED' | 'SNIPE_MAFIA' | 'SNIPE_CITIZEN' | 'SILENCED' | 'SHERIFF_RESULT';
  targetPhysicalId: number;
  targetName: string;
  extra?: Record<string, unknown>;
  revealed: boolean;
}

export interface GameConfig {
  maxJustifications: number;
  currentJustification: number;
  gameName: string;
  maxPlayers: number;
  displayPin: string;
}

export interface GameState {
  roomId: string;
  roomCode: string;
  phase: Phase;
  round: number;
  config: GameConfig;
  players: Player[];
  rolesPool?: Role[];
  discussionState: DiscussionState | null;
  votingState: VotingState;
  nightActions: NightActions;
  morningEvents: MorningEvent[];
  pendingResolution?: {
    candidate: Candidate;
    type: 'ELIMINATE' | 'ACCEPT_DEAL' | 'REJECT_DEAL' | 'NONE';
  } | null;
  tiedCandidates?: Candidate[]; // In case of tie
  justificationData?: any; // بيانات التبرير المحفوظة لاستعادتها عند إعادة الاتصال
  winner: 'MAFIA' | 'CITIZEN' | null;
  pendingWinner?: string | null; // فوز مُعلّق (ينتظر تأكيد الليدر بعد ملخص الصباح)
  nurseActivated?: boolean; // هل الليدر فعّل الممرضة في بداية هذا الليل
  rolesConfirmed?: boolean; // هل الليدر أكد توزيع الأدوار (يمنع إرسالها للاعبين قبل التأكيد)
  startedAt?: string; // وقت بداية اللعبة (عند اعتماد الأدوار)
  matchId?: number; // ID السجل في PostgreSQL
  sessionId?: number; // ID الغرفة في PostgreSQL
  sessionCode?: string; // كود الغرفة الثابت
  activityId?: number; // ID النشاط المرتبط
  createdAt: string;
}

// ── إنشاء كود غرفة 6 أرقام ──────────────────────

function generateRoomCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ── إنشاء PIN لشاشة العرض ────────────────────────

function generateDisplayPin(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// ── إنشاء غرفة جديدة ─────────────────────────────

export async function createRoom(
  gameName: string,
  maxPlayers: number = 10,
  maxJustifications: number = 2,
  displayPin?: string,
): Promise<GameState> {
  const roomId = uuidv4().substring(0, 8);
  const roomCode = generateRoomCode();

  const state: GameState = {
    roomId,
    roomCode,
    phase: Phase.LOBBY,
    round: 0,
    config: {
      maxJustifications,
      currentJustification: 0,
      gameName,
      maxPlayers: Math.min(Math.max(maxPlayers, 6), 27),
      displayPin: displayPin || generateDisplayPin(),
    },
    players: [],
    rolesPool: [],
    discussionState: null,
    votingState: {
      totalVotesCast: 0,
      deals: [],
      candidates: [],
      hiddenPlayersFromVoting: [],
      tieBreakerLevel: 0,
    },
    nightActions: {
      godfatherTarget: null,
      silencerTarget: null,
      sheriffTarget: null,
      sheriffResult: null,
      doctorTarget: null,
      sniperTarget: null,
      nurseTarget: null,
      lastProtectedTarget: null,
    },
    morningEvents: [],
    winner: null,
    createdAt: new Date().toISOString(),
  };

  await setGameState(roomId, state);

  // حفظ mapping roomCode → roomId
  await setGameState(`code:${roomCode}`, { roomId } as any);

  return state;
}

// ── البحث بكود الغرفة ─────────────────────────────

export async function getRoomByCode(roomCode: string): Promise<GameState | null> {
  const mapping = await getGameState(`code:${roomCode}`) as any;
  if (!mapping?.roomId) return null;
  return await getGameState(mapping.roomId);
}

// ── قراءة الغرفة ──────────────────────────────────

export async function getRoom(roomId: string): Promise<GameState | null> {
  return await getGameState(roomId);
}

// ── تحديث جزئي ──────────────────────────────────

export async function updateRoom(roomId: string, updates: Partial<GameState>): Promise<GameState> {
  const state = await getGameState(roomId);
  if (!state) throw new Error(`Room ${roomId} not found`);

  const updated = { ...state, ...updates };
  await setGameState(roomId, updated);
  return updated;
}

// ── إضافة لاعب ──────────────────────────────────

export async function addPlayer(
  roomId: string,
  physicalId: number,
  name: string,
  phone: string | null = null,
  playerId: number | null = null,
  addedBy: 'self' | 'leader' = 'self',
): Promise<GameState> {
  console.log(`[State] addPlayer ➡️ Start for physicalId ${physicalId}, phone: ${phone}`);
  const state = await getGameState(roomId);
  if (!state) throw new Error(`Room ${roomId} not found`);

  // التحقق من الحد الأقصى
  if (state.players.length >= state.config.maxPlayers) {
    console.error(`[State] addPlayer ❌ Room full!`);
    throw new Error(`الغرفة ممتلئة (${state.config.maxPlayers} لاعب كحد أقصى)`);
  }

  // التحقق من تكرار رقم الهاتف (يُستثنى 0700000000)
  if (phone && phone !== '0700000000') {
    const existingByPhone = state.players.find(p => p.phone === phone);
    if (existingByPhone) {
      // إذا اللاعب أضافه الليدر يدوياً → ربط اللاعب بالمقعد الموجود
      if (existingByPhone.addedBy === 'leader') {
        console.log(`[State] addPlayer 🔗 Linking player to leader-added seat #${existingByPhone.physicalId}`);
        existingByPhone.playerId = playerId;
        existingByPhone.addedBy = 'self'; // أصبح مسجلاً ذاتياً
        if (name) existingByPhone.name = name;
        await setGameState(roomId, state);
        return state;
      }
      console.error(`[State] addPlayer ❌ Phone ${phone} already exists!`);
      throw new Error(`رقم الهاتف ${phone} مسجل مسبقاً في هذه الغرفة`);
    }
  }

  // التحقق من عدم تكرار الرقم الفيزيائي
  if (state.players.some(p => p.physicalId === physicalId)) {
    console.error(`[State] addPlayer ❌ Physical ID ${physicalId} already exists!`);
    throw new Error(`الرقم ${physicalId} مسجل مسبقاً`);
  }

  const player: Player = {
    physicalId,
    name,
    phone,
    dob: null,
    gender: null,
    playerId,
    role: null,
    isAlive: true,
    isSilenced: false,
    justificationCount: 0,
    addedBy,
  };

  state.players.push(player);
  state.players.sort((a, b) => a.physicalId - b.physicalId);
  await setGameState(roomId, state);
  console.log(`[State] addPlayer ✅ Player #${physicalId} (${addedBy}) added successfully to Redis`);
  return state;
}

// ── تعديل لاعب (Override الليدر) ────────────────

export async function updatePlayer(
  roomId: string,
  physicalId: number,
  updates: Partial<Pick<Player, 'name' | 'physicalId' | 'dob' | 'gender' | 'avatarUrl'>>
): Promise<GameState> {
  console.log(`[State] updatePlayer ➡️ Start for physicalId ${physicalId} with updates:`, updates);
  const state = await getGameState(roomId);
  if (!state) throw new Error(`Room ${roomId} not found`);

  const player = state.players.find(p => p.physicalId === physicalId);
  if (!player) {
    console.error(`[State] updatePlayer ❌ Player #${physicalId} not found`);
    throw new Error(`Player #${physicalId} not found`);
  }

  Object.assign(player, updates);
  await setGameState(roomId, state);
  console.log(`[State] updatePlayer ✅ Player #${physicalId} updated successfully in Redis`);
  return state;
}

// ── ربط دور بلاعب ──────────────────────────────

export async function bindRole(roomId: string, physicalId: number, role: Role): Promise<GameState> {
  const state = await getGameState(roomId);
  if (!state) throw new Error(`Room ${roomId} not found`);

  const player = state.players.find(p => p.physicalId === physicalId);
  if (!player) throw new Error(`Player #${physicalId} not found`);

  player.role = role;
  await setGameState(roomId, state);
  return state;
}

export async function unbindRole(roomId: string, physicalId: number): Promise<GameState> {
  const state = await getGameState(roomId);
  if (!state) throw new Error(`Room ${roomId} not found`);

  const player = state.players.find(p => p.physicalId === physicalId);
  if (!player) throw new Error(`Player #${physicalId} not found`);

  player.role = null;
  await setGameState(roomId, state);
  return state;
}

// ── إقصاء لاعب ────────────────────────────────

export async function eliminatePlayer(roomId: string, physicalId: number): Promise<GameState> {
  const state = await getGameState(roomId);
  if (!state) throw new Error(`Room ${roomId} not found`);

  const player = state.players.find(p => p.physicalId === physicalId);
  if (!player) throw new Error(`Player #${physicalId} not found`);

  player.isAlive = false;
  await setGameState(roomId, state);
  return state;
}

// ── تغيير المرحلة ──────────────────────────────

export async function setPhase(roomId: string, phase: Phase): Promise<GameState> {
  return await updateRoom(roomId, { phase });
}

// ── حذف الغرفة ──────────────────────────────────

export async function deleteRoom(roomId: string): Promise<void> {
  const state = await getGameState(roomId);
  if (state?.roomCode) {
    await deleteGameState(`code:${state.roomCode}`);
  }
  await deleteGameState(roomId);
}

// ── قائمة الغرف النشطة ──────────────────────────

export async function listActiveRooms(): Promise<GameState[]> {
  // ملاحظة: هذا يحتاج scan في Redis. حالياً نستخدم قائمة محلية
  return [];
}

// ── مُساعدات ────────────────────────────────────

export function getAlivePlayers(state: GameState): Player[] {
  return state.players.filter(p => p.isAlive);
}

export function getAlivePlayersByTeam(state: GameState): { mafia: Player[]; citizens: Player[] } {
  const alive = getAlivePlayers(state);
  const { isMafiaRole } = require('./roles.js');

  return {
    mafia: alive.filter(p => p.role && isMafiaRole(p.role)),
    citizens: alive.filter(p => p.role && !isMafiaRole(p.role)),
  };
}
