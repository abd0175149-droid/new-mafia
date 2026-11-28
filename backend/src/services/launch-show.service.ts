// ══════════════════════════════════════════════════════
// 🎬 عرض ليلة الإطلاق — حالةٌ واحدة يقودها الليدر، وتتبعها التلفازات والهواتف ولابتوب الصوت
//
// • المراحل مرتّبة (STAGES). كلّ ضغطة من الليدر ترفع seq، فيعرف كلّ عارضٍ أنّ شيئاً تغيّر.
// • المحتوى (النصوص، الكروت، التوقيتات) في قاعدة البيانات launch_show.content — لا في الكود،
//   لأنّ المستودع علنيّ. ما يُرسل للعموم يُقتطع حسب المرحلة: لا سطر ولا كرت قبل وقته.
// • الملفّات (صور الكروت والصوت) في uploads/private/launch — لا تُخدم ثابتةً أبداً؛
//   الصور بعد كشف كرتها فقط، والصوت للطاقم فقط (لابتوب الصوت).
// ══════════════════════════════════════════════════════

import { sql } from 'drizzle-orm';
import { randomInt } from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDB } from '../config/db.js';

export const STAGES = ['idle', 'countdown', 'break', 'cards', 'lineup', 'predict', 'predict_closed', 'result', 'draw', 'end'] as const;
export type Stage = typeof STAGES[number];
const rank = (s: string) => Math.max(0, STAGES.indexOf(s as Stage));

export const LAUNCH_DIR = path.resolve('uploads/private/launch');

const rows = (r: any): any[] => r?.rows ?? (Array.isArray(r) ? r : []);

interface Row {
  stage: Stage; seq: number; stage_at: string; card_index: number; poll_open: boolean;
  answer: string | null; winner: any; content: any; updated_at: string; last_action: string | null;
}

let cache: { at: number; row: Row } | null = null;
const CACHE_MS = 250;

export async function ensureLaunchTables(db: any) {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS launch_show (
    id INTEGER PRIMARY KEY DEFAULT 1,
    stage VARCHAR(24) NOT NULL DEFAULT 'idle',
    seq INTEGER NOT NULL DEFAULT 0,
    stage_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    card_index INTEGER NOT NULL DEFAULT -1,
    poll_open BOOLEAN NOT NULL DEFAULT false,
    answer VARCHAR(24),
    winner JSONB,
    content JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await db.execute(sql`INSERT INTO launch_show (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
  await db.execute(sql`ALTER TABLE launch_show ADD COLUMN IF NOT EXISTS last_action VARCHAR(16)`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS launch_poll_votes (
    device_id VARCHAR(64) PRIMARY KEY, choice VARCHAR(24) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS launch_predictions (
    id SERIAL PRIMARY KEY, phone VARCHAR(20) NOT NULL UNIQUE, name VARCHAR(80) NOT NULL, choice VARCHAR(24) NOT NULL,
    device_id VARCHAR(64), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
}

async function load(fresh = false): Promise<Row> {
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.row;
  const db = getDB(); if (!db) throw new Error('قاعدة البيانات غير متّصلة');
  const [r] = rows(await db.execute(sql`SELECT stage, seq, stage_at, card_index, poll_open, answer, winner, content, updated_at, last_action FROM launch_show WHERE id = 1`));
  if (!r) throw new Error('عرض الإطلاق غير مهيّأ');
  cache = { at: Date.now(), row: r };
  return r;
}

async function counts() {
  const db = getDB(); if (!db) return { poll: {}, predictions: 0, byChoice: {} as Record<string, number> };
  const poll = rows(await db.execute(sql`SELECT choice, count(*)::int n FROM launch_poll_votes GROUP BY choice`));
  const pred = rows(await db.execute(sql`SELECT choice, count(*)::int n FROM launch_predictions GROUP BY choice`));
  const byChoice: Record<string, number> = {}; let total = 0;
  for (const p of pred) { byChoice[p.choice] = p.n; total += p.n; }
  return { poll: Object.fromEntries(poll.map((p: any) => [p.choice, p.n])), predictions: total, byChoice };
}
let countCache: { at: number; v: Awaited<ReturnType<typeof counts>> } | null = null;
async function cachedCounts() {
  if (countCache && Date.now() - countCache.at < 1000) return countCache.v;
  countCache = { at: Date.now(), v: await counts() };
  return countCache.v;
}

const cardsOf = (c: any): any[] => Array.isArray(c?.cards) ? c.cards : [];

// ── الحضور: من يتّصل الآن (للأضواء في جهاز الليدر) — في الذاكرة فقط، لا يُحفظ ──
const seen = { tv: new Map<string, number>(), guest: new Map<string, number>() };
let soundSeen = { at: 0, playing: '' };
export function touch(role: string, id: string) {
  if ((role === 'tv' || role === 'guest') && /^[\w-]{6,64}$/.test(id)) seen[role].set(id, Date.now());
}
export function touchSound(playing: string) { soundSeen = { at: Date.now(), playing: String(playing || '').slice(0, 40) }; }
function presence() {
  const now = Date.now();
  const cnt = (m: Map<string, number>, ms: number) => { let n = 0; for (const [k, t] of m) { if (now - t < ms) n++; else if (now - t > 600_000) m.delete(k); } return n; };
  return { tvs: cnt(seen.tv, 9000), guests: cnt(seen.guest, 25_000), sound: { alive: now - soundSeen.at < 6000, playing: now - soundSeen.at < 6000 ? soundSeen.playing : '' } };
}

/** كم كرتاً كُشف حتّى الآن (يحكم الصور والبيانات) */
function revealedCards(r: Row): number {
  const n = cardsOf(r.content).length;
  if (r.stage === 'cards') return Math.max(0, Math.min(n, r.card_index + 1));
  return rank(r.stage) > rank('cards') ? n : 0;
}

/** ما يراه العموم (التلفاز والهاتف): مقتطعٌ حسب المرحلة */
export async function publicState(previewKey?: string) {
  const r = await load();
  const c = r.content || {};
  // قبل يوم الإطلاق: التجربة بمحتوى حقيقيّ لا تُكشف إلّا لشاشةٍ معها مفتاح المعاينة (المحفوظ في المحتوى، لا في الكود)
  const breakAt = c.breakAt ? new Date(c.breakAt).getTime() : 0;
  const early = !!breakAt && Date.now() < breakAt - 3 * 3600_000;
  const allowed = !early || (!!c.previewKey && previewKey === c.previewKey);
  const st = allowed ? rank(r.stage) : Math.min(rank(r.stage), rank('countdown'));
  const k = await cachedCounts();
  const out: any = {
    stage: allowed ? r.stage : (st >= rank('countdown') ? 'countdown' : r.stage), seq: allowed ? r.seq : 0, stageAt: new Date(r.stage_at).getTime(), now: Date.now(),
    cardIndex: r.card_index,
    breakAt: c.breakAt || null, qrUrl: c.qrUrl || null,
    poll: { open: !!r.poll_open, question: c.poll?.question || null, options: c.poll?.options || [], counts: k.poll },
  };
  if (st >= rank('break')) {
    out.title = c.title || null; out.motto = c.motto || null;
    out.prophecy = c.prophecy ? { lead: c.prophecy.lead ?? 4, lines: c.prophecy.lines || [] } : null;
  }
  if (st >= rank('cards')) {
    out.cardsIntro = c.cardsIntro ? { text: c.cardsIntro.text || '' } : null;
    out.cards = cardsOf(c).slice(0, revealedCards(r)).map((x: any) => ({
      key: x.key, name: x.name, slogan: x.slogan, text: x.text, entry: x.entry, image: `/api/launch-show/asset/card/${encodeURIComponent(x.key)}`,
    }));
    out.cardsTotal = cardsOf(c).length;
  }
  if (st >= rank('predict')) {
    out.predict = { question: c.predict?.question || null, options: c.predict?.options || [], prize: c.predict?.prize || null, count: k.predictions };
  }
  if (st >= rank('result')) {
    out.predict.answer = r.answer;
    out.predict.correct = r.answer ? (k.byChoice[r.answer] || 0) : 0;
  }
  if (st >= rank('draw') && r.winner) {
    out.winner = { name: r.winner.name, at: r.winner.at, tail: String(r.winner.phone || '').slice(-3) };
    out.drawNames = r.winner.pool || [];
  }
  if (st >= rank('end')) out.end = c.end || null;
  return out;
}

/** ما يراه الليدر ولابتوب الصوت: كلّ شيء + الإحصاءات + مفاتيح الصوت */
export async function staffState() {
  const r = await load(true);
  const k = await counts();
  return {
    stage: r.stage, seq: r.seq, stageAt: new Date(r.stage_at).getTime(), now: Date.now(), cardIndex: r.card_index,
    pollOpen: r.poll_open, answer: r.answer, winner: r.winner ? { name: r.winner.name, phone: r.winner.phone, at: r.winner.at } : null,
    counts: k, stages: STAGES, lastAction: r.last_action, presence: presence(),
    content: r.content || {},
    hasContent: !!(r.content && Object.keys(r.content).length),
  };
}

async function write(patch: Partial<{ stage: Stage; card_index: number; poll_open: boolean; answer: string | null; winner: any }>, bump = true, action = '') {
  const db = getDB(); if (!db) throw new Error('قاعدة البيانات غير متّصلة');
  const cur = await load(true);
  const stage = patch.stage ?? cur.stage;
  const card = patch.card_index ?? cur.card_index;
  const poll = patch.poll_open ?? cur.poll_open;
  const answer = patch.answer !== undefined ? patch.answer : cur.answer;
  const winner = patch.winner !== undefined ? patch.winner : cur.winner;
  if (bump) {
    await db.execute(sql`UPDATE launch_show SET stage = ${stage}, card_index = ${card}, poll_open = ${poll}, answer = ${answer},
      winner = ${winner == null ? null : JSON.stringify(winner)}::jsonb, seq = seq + 1, stage_at = now(), updated_at = now(), last_action = ${action || null} WHERE id = 1`);
  } else {
    await db.execute(sql`UPDATE launch_show SET stage = ${stage}, card_index = ${card}, poll_open = ${poll}, answer = ${answer},
      winner = ${winner == null ? null : JSON.stringify(winner)}::jsonb, updated_at = now() WHERE id = 1`);
  }
  cache = null; countCache = null;
}

const firstName = (n: string) => String(n || '').trim().split(/\s+/).slice(0, 2).join(' ');

/** أوامر الليدر */
export async function control(action: string, body: any) {
  const r = await load(true);
  const nCards = cardsOf(r.content).length;
  switch (action) {
    case 'goto': {
      const s = String(body?.stage || '');
      if (!STAGES.includes(s as Stage)) throw new Error('مرحلة غير معروفة');
      await write({ stage: s as Stage, card_index: s === 'cards' ? -1 : r.card_index, poll_open: s === 'countdown' ? r.poll_open : false }, true, 'goto');
      break;
    }
    case 'card_next': {
      if (r.stage !== 'cards') { await write({ stage: 'cards', card_index: -1 }, true, 'next'); break; }
      if (r.card_index + 1 >= nCards) { await write({ stage: 'lineup' }, true, 'next'); break; }
      await write({ card_index: r.card_index + 1 }, true, 'next');
      break;
    }
    case 'card_prev': {
      if (r.stage === 'lineup') { await write({ stage: 'cards', card_index: nCards - 1 }, true, 'back'); break; }
      if (r.stage !== 'cards') throw new Error('لسنا في مرحلة الكروت');
      await write({ card_index: Math.max(-1, r.card_index - 1) }, true, 'back');
      break;
    }
    case 'back': {   // رجوع خطوة: داخل الكروت كرتاً، وغير ذلك مرحلةً (بلا تشغيل صوت)
      if (r.stage === 'cards' && r.card_index >= 0) { await write({ card_index: r.card_index - 1 }, true, 'back'); break; }
      if (r.stage === 'lineup') { await write({ stage: 'cards', card_index: nCards - 1 }, true, 'back'); break; }
      const i = rank(r.stage); if (i <= 0) throw new Error('هذه أوّل مرحلة');
      let prev = STAGES[i - 1];
      if (prev === 'draw' || prev === 'result') prev = 'predict_closed';
      await write({ stage: prev, card_index: prev === 'cards' ? nCards - 1 : r.card_index, answer: rank(prev) < rank('result') ? null : r.answer, winner: rank(prev) < rank('draw') ? null : r.winner }, true, 'back');
      break;
    }
    case 'replay': await write({}, true, 'replay'); break;   // يعيد مقطع المرحلة الحاليّة وتوقيتها على كلّ الشاشات
    case 'poll': await write({ poll_open: !!body?.open }, false); break;
    case 'answer': {
      const a = String(body?.answer || '');
      const keys = (r.content?.predict?.options || []).map((o: any) => o.key);
      if (!keys.includes(a)) throw new Error('جواب غير معروف');
      await write({ stage: 'result', answer: a, winner: null }, true, 'answer');
      break;
    }
    case 'draw': {
      if (!r.answer) throw new Error('حدّد الجواب الصحيح أوّلاً');
      const db = getDB(); if (!db) throw new Error('قاعدة البيانات غير متّصلة');
      const exclude: string[] = Array.isArray(body?.exclude) ? body.exclude.map(String) : (body?.redraw && r.winner?.phone ? [r.winner.phone, ...(r.winner.excluded || [])] : []);
      const pool = rows(await db.execute(sql`SELECT name, phone FROM launch_predictions WHERE choice = ${r.answer} ORDER BY id`))
        .filter((p: any) => !exclude.includes(p.phone));
      if (!pool.length) throw new Error('لا يوجد من توقّع صحّاً (أو استُبعد الجميع)');
      const w = pool[randomInt(pool.length)];
      const names = pool.map((p: any) => firstName(p.name)).slice(0, 60);
      await write({ stage: 'draw', winner: { name: firstName(w.name), fullName: w.name, phone: w.phone, at: Date.now(), pool: names, excluded: exclude } }, true, 'draw');
      break;
    }
    case 'reset': {
      const db = getDB(); if (!db) throw new Error('قاعدة البيانات غير متّصلة');
      if (body?.wipe) { await db.execute(sql`DELETE FROM launch_poll_votes`); await db.execute(sql`DELETE FROM launch_predictions`); }
      await write({ stage: 'idle', card_index: -1, poll_open: false, answer: null, winner: null }, true, 'reset');
      break;
    }
    default: throw new Error('أمر غير معروف');
  }
  return staffState();
}

export function normPhone(p: any): string | null {
  let d = String(p || '').replace(/[٠-٩]/g, c => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/\D/g, '');
  if (d.startsWith('00962')) d = d.slice(5); else if (d.startsWith('962')) d = d.slice(3);
  if (d.length === 9 && d.startsWith('7')) d = '0' + d;
  return /^07[789]\d{7}$/.test(d) ? d : null;
}

export async function vote(deviceId: string, choice: string) {
  const r = await load();
  if (!r.poll_open) throw Object.assign(new Error('التصويت مغلق'), { status: 409 });
  const keys = (r.content?.poll?.options || []).map((o: any) => o.key);
  if (!keys.includes(choice)) throw Object.assign(new Error('خيار غير معروف'), { status: 400 });
  const db = getDB(); if (!db) throw new Error('قاعدة البيانات غير متّصلة');
  await db.execute(sql`INSERT INTO launch_poll_votes (device_id, choice) VALUES (${deviceId}, ${choice})
    ON CONFLICT (device_id) DO UPDATE SET choice = EXCLUDED.choice, created_at = now()`);
  countCache = null;
}

export async function predict(input: { name: any; phone: any; choice: any; deviceId?: any }) {
  const r = await load();
  if (r.stage !== 'predict') throw Object.assign(new Error('باب النبوءات مغلق الآن'), { status: 409 });
  const name = String(input.name || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 40) throw Object.assign(new Error('اكتب اسمك (من حرفين إلى ٤٠ حرفاً)'), { status: 400 });
  const phone = normPhone(input.phone);
  if (!phone) throw Object.assign(new Error('رقم الهاتف غير صحيح: اكتبه مثل 0791234567'), { status: 400 });
  const keys = (r.content?.predict?.options || []).map((o: any) => o.key);
  const choice = String(input.choice || '');
  if (!keys.includes(choice)) throw Object.assign(new Error('اختر نبوءتك'), { status: 400 });
  const db = getDB(); if (!db) throw new Error('قاعدة البيانات غير متّصلة');
  await db.execute(sql`INSERT INTO launch_predictions (phone, name, choice, device_id) VALUES (${phone}, ${name}, ${choice}, ${String(input.deviceId || '').slice(0, 64) || null})
    ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name, choice = EXCLUDED.choice, device_id = EXCLUDED.device_id, updated_at = now()`);
  countCache = null;
  return { phone, choice };
}

/** صورة كرت — فقط بعد كشفه */
export async function cardAsset(key: string, previewKey?: string): Promise<string | null> {
  const r = await load();
  const c = r.content || {};
  const breakAt = c.breakAt ? new Date(c.breakAt).getTime() : 0;
  if (breakAt && Date.now() < breakAt - 3 * 3600_000 && !(c.previewKey && previewKey === c.previewKey)) return null;
  const list = cardsOf(r.content);
  const i = list.findIndex((x: any) => x.key === key);
  if (i < 0 || i >= revealedCards(r)) return null;
  const file = String(list[i].image || '');
  if (!/^[\w.-]+$/.test(file)) return null;
  const p = path.join(LAUNCH_DIR, 'cards', file);
  return fs.existsSync(p) ? p : null;
}

/** مقطع صوت — للطاقم فقط */
export function audioFile(key: string): string | null {
  if (!/^[\w-]+$/.test(key)) return null;
  for (const ext of ['.mp3', '.m4a', '.wav']) {
    const p = path.join(LAUNCH_DIR, 'audio', key + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** تحميل المحتوى من ملفّ JSON على السيرفر (سكربت launch-show-content) */
export async function setContent(content: any) {
  const db = getDB(); if (!db) throw new Error('قاعدة البيانات غير متّصلة');
  await db.execute(sql`UPDATE launch_show SET content = ${JSON.stringify(content)}::jsonb, updated_at = now() WHERE id = 1`);
  cache = null;
}
