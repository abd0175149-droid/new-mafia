// ══════════════════════════════════════════════════════
// 🔴 اتصال Redis — Live Game State Store
// مع fallback تلقائي للذاكرة إذا Redis غير متوفر
// ══════════════════════════════════════════════════════

import { createClient, type RedisClientType } from 'redis';
import { env } from './env.js';

let redisClient: RedisClientType | null = null;
let useInMemory = false;

// ── مخزن بديل في الذاكرة (للتطوير بدون Redis) ───────
const inMemoryStore = new Map<string, string>();

// ── الاتصال بـ Redis ─────────────────────────────────
export async function connectRedis(): Promise<void> {
  try {
    redisClient = createClient({
      url: env.REDIS_URL,
      socket: {
        connectTimeout: 3000,       // 3 ثوانٍ فقط للمحاولة
        reconnectStrategy: false,   // ❌ لا تعيد المحاولة — استخدم الذاكرة
      },
    });

    // التقاط الأخطاء بصمت بعد الـ fallback
    redisClient.on('error', () => {
      // صامت — لا نطبع أخطاء متكررة
    });

    await redisClient.connect();
    console.log('✅ Redis connected successfully');
    useInMemory = false;
  } catch (err: any) {
    console.warn(`⚠️ Redis unavailable — using in-memory store (dev mode)`);
    // تنظيف أي اتصال معلق
    if (redisClient) {
      try { await redisClient.disconnect(); } catch { /* ignore */ }
    }
    redisClient = null;
    useInMemory = true;
  }
}

// ── هل نستخدم الذاكرة المحلية؟ ─────────────────────
export function isUsingInMemory(): boolean {
  return useInMemory;
}

// ── حفظ حالة اللعبة ─────────────────────────────────
export async function setGameState(key: string, state: any): Promise<void> {
  const json = JSON.stringify(state);

  if (redisClient && !useInMemory) {
    try {
      await redisClient.set(`game:${key}`, json, { EX: 86400 });
    } catch {
      // fallback to memory if Redis fails mid-operation
      inMemoryStore.set(`game:${key}`, json);
    }
  } else {
    inMemoryStore.set(`game:${key}`, json);
  }
}

// ── قراءة حالة اللعبة ────────────────────────────────
export async function getGameState(key: string): Promise<any | null> {
  let json: string | null = null;

  if (redisClient && !useInMemory) {
    try {
      json = await redisClient.get(`game:${key}`);
    } catch {
      json = inMemoryStore.get(`game:${key}`) || null;
    }
  } else {
    json = inMemoryStore.get(`game:${key}`) || null;
  }

  return json ? JSON.parse(json) : null;
}

// ── حذف حالة اللعبة ─────────────────────────────────
export async function deleteGameState(key: string): Promise<void> {
  if (redisClient && !useInMemory) {
    try {
      await redisClient.del(`game:${key}`);
    } catch {
      inMemoryStore.delete(`game:${key}`);
    }
  } else {
    inMemoryStore.delete(`game:${key}`);
  }
}

// ── قائمة كل المفاتيح (scan) ─────────────────────────
export async function scanGameKeys(pattern: string = 'game:*'): Promise<string[]> {
  if (redisClient && !useInMemory) {
    try {
      const keys: string[] = [];
      for await (const key of redisClient.scanIterator({ MATCH: pattern })) {
        keys.push(key);
      }
      return keys;
    } catch {
      return Array.from(inMemoryStore.keys()).filter(k => k.startsWith('game:'));
    }
  } else {
    return Array.from(inMemoryStore.keys()).filter(k => k.startsWith('game:'));
  }
}

// ── إغلاق الاتصال ──────────────────────────────────
export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch { /* ignore */ }
    redisClient = null;
    console.log('🔌 Redis disconnected');
  }
}
