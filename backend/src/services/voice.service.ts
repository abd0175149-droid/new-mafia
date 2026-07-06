// ══════════════════════════════════════════════════════
// 🎙️ خدمة الصوت/الفيديو عبر Cloudflare RealtimeKit
// ══════════════════════════════════════════════════════
// اجتماعٌ واحد لكل غرفة (يُنشأ عند أول طلب توكن ويُخزَّن في حالة اللعبة).
// كل مشارك يحصل على توكن قصير العمر مع Preset حسب حالته:
//   host  → mafia_leader (يكتم الآخرين + يغيّر الأذونات)
//   alive → mafia_player (يبثّ؛ الخادم يكتم الجميع ويفتح المتحدّث فقط)
//   dead  → mafia_dead   (لا يستطيع البثّ إطلاقاً — تفرّج فقط)
// الوثائق: POST /meetings ثم POST /meetings/{id}/participants { name, preset_name, custom_participant_id }.

import { getGameState, setGameState } from '../config/redis.js';

const ACCT = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const APP_ID = process.env.CLOUDFLARE_REALTIMEKIT_APP_ID || '';
const TOKEN = process.env.CLOUDFLARE_REALTIMEKIT_TOKEN || '';
const PRESET_LEADER = process.env.RTK_PRESET_LEADER || 'mafia_leader';
const PRESET_PLAYER = process.env.RTK_PRESET_PLAYER || 'mafia_player';
const PRESET_DEAD = process.env.RTK_PRESET_DEAD || 'mafia_dead';

const BASE = () => `https://api.cloudflare.com/client/v4/accounts/${ACCT}/realtime/kit/${APP_ID}`;

export function isVoiceConfigured(): boolean {
  return !!(ACCT && APP_ID && TOKEN);
}

async function cf(method: 'POST' | 'PATCH' | 'GET', path: string, body?: any): Promise<any> {
  const res = await fetch(`${BASE()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json: any = {};
  try { json = await res.json(); } catch { /* قد لا يكون JSON */ }
  if (!res.ok || json?.success === false) {
    throw new Error(`RealtimeKit ${method} ${path} → ${res.status} ${JSON.stringify(json?.errors || json || {})}`);
  }
  return json?.result ?? json;
}

// قفلٌ داخل-العملية يمنع إنشاء اجتماعين لنفس الغرفة عند طلبين متزامنين
const inflight = new Map<string, Promise<string>>();

export async function getOrCreateMeeting(roomId: string): Promise<string> {
  const state = await getGameState(roomId);
  if (!state) throw new Error('Room not found');
  const existing = state.config?.voiceMeetingId;
  if (existing) return existing;
  if (inflight.has(roomId)) return inflight.get(roomId)!;

  const p = (async () => {
    const meeting = await cf('POST', '/meetings', { title: `mafia-${roomId}` });
    const meetingId: string = meeting?.id;
    if (!meetingId) throw new Error('RealtimeKit: no meeting id returned');
    const s2 = await getGameState(roomId);
    if (s2) { s2.config.voiceMeetingId = meetingId; await setGameState(roomId, s2); }
    return meetingId;
  })();
  inflight.set(roomId, p);
  try { return await p; } finally { inflight.delete(roomId); }
}

export function presetForPlayer(opts: { isHost: boolean; isAlive: boolean }): string {
  if (opts.isHost) return PRESET_LEADER;
  if (!opts.isAlive) return PRESET_DEAD;
  return PRESET_PLAYER;
}

export async function issueParticipantToken(
  meetingId: string,
  p: { name: string; presetName: string; customParticipantId: string },
): Promise<string> {
  const result = await cf('POST', `/meetings/${meetingId}/participants`, {
    name: p.name,
    preset_name: p.presetName,
    custom_participant_id: p.customParticipantId,
  });
  const token: string = result?.token;
  if (!token) throw new Error('RealtimeKit: no participant token returned');
  return token;
}
