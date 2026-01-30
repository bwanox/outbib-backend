import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Pool } from 'pg';

@Injectable()
export class MemoryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MemoryService.name);
  private redis?: Redis;
  private pool?: Pool;

  private readonly redisKeyPrefix = 'ai:memory:';
  private readonly redisChatKeyPrefix = 'ai:chat:';
  private readonly ttlSec = 60 * 60 * 24 * 7; // 7 days

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL') || 'redis://redis:6379';
    this.redis = new Redis(redisUrl, { lazyConnect: true });
    try {
      await this.redis.connect();
    } catch (e) {
      this.logger.warn('Redis not available; memory cache disabled');
    }

    const dbUrl = this.configService.get<string>('DATABASE_URL');
    if (!dbUrl) {
      this.logger.warn('DATABASE_URL not set; persistent memory disabled');
      return;
    }

    this.pool = new Pool({ connectionString: dbUrl });
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ai_user_memory (
        user_id TEXT PRIMARY KEY,
        keypoints JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ai_user_summary (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        summary TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ai_user_chats (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        messages JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ai_user_chat_memory (
        user_id TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        keypoints JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, chat_id)
      )
    `);
  }

  async onModuleDestroy() {
    try {
      await this.redis?.quit();
    } catch {
      // ignore
    }
    try {
      await this.pool?.end();
    } catch {
      // ignore
    }
  }

  async getMemory(userId: string): Promise<string[]> {
    const cacheKey = `${this.redisKeyPrefix}${userId}`;
    if (this.redis) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) return JSON.parse(cached);
      } catch {
        // ignore cache errors
      }
    }

    if (!this.pool) return [];

    const res = await this.pool.query('SELECT keypoints FROM ai_user_memory WHERE user_id = $1', [userId]);
    const keypoints = Array.isArray(res.rows[0]?.keypoints) ? res.rows[0].keypoints : [];

    if (this.redis) {
      try {
        await this.redis.set(cacheKey, JSON.stringify(keypoints), 'EX', this.ttlSec);
      } catch {
        // ignore cache errors
      }
    }

    return keypoints;
  }

  async getMemoryDetail(userId: string): Promise<{ keypoints: string[]; updatedAt?: string | null }> {
    if (!this.pool) return { keypoints: [] };
    const res = await this.pool.query('SELECT keypoints, updated_at FROM ai_user_memory WHERE user_id = $1', [userId]);
    const keypoints = Array.isArray(res.rows[0]?.keypoints) ? res.rows[0].keypoints : [];
    const updatedAt = res.rows[0]?.updated_at ? String(res.rows[0].updated_at) : null;
    return { keypoints, updatedAt };
  }

  async upsertMemory(userId: string, keypoints: string[]): Promise<void> {
    const normalized = keypoints
      .map((s) => String(s).trim())
      .filter(Boolean)
      .slice(0, 12);

    if (!this.pool) return;

    await this.pool.query(
      `
      INSERT INTO ai_user_memory (user_id, keypoints, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET keypoints = EXCLUDED.keypoints, updated_at = NOW()
      `,
      [userId, JSON.stringify(normalized)]
    );

    if (this.redis) {
      try {
        const cacheKey = `${this.redisKeyPrefix}${userId}`;
        await this.redis.set(cacheKey, JSON.stringify(normalized), 'EX', this.ttlSec);
      } catch {
        // ignore cache errors
      }
    }
  }

  async getChatMemory(userId: string, chatId: string): Promise<string[]> {
    const cacheKey = `${this.redisChatKeyPrefix}${userId}:${chatId}`;
    if (this.redis) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) return JSON.parse(cached);
      } catch {
        // ignore cache errors
      }
    }

    if (!this.pool) return [];
    const res = await this.pool.query(
      'SELECT keypoints FROM ai_user_chat_memory WHERE user_id = $1 AND chat_id = $2',
      [userId, chatId]
    );
    const keypoints = Array.isArray(res.rows[0]?.keypoints) ? res.rows[0].keypoints : [];

    if (this.redis) {
      try {
        await this.redis.set(cacheKey, JSON.stringify(keypoints), 'EX', this.ttlSec);
      } catch {
        // ignore cache errors
      }
    }

    return keypoints;
  }

  async upsertChatMemory(userId: string, chatId: string, keypoints: string[]): Promise<void> {
    const normalized = keypoints
      .map((s) => String(s).trim())
      .filter(Boolean)
      .slice(0, 12);

    if (!this.pool) return;

    await this.pool.query(
      `
      INSERT INTO ai_user_chat_memory (user_id, chat_id, keypoints, updated_at)
      VALUES ($1, $2, $3::jsonb, NOW())
      ON CONFLICT (user_id, chat_id)
      DO UPDATE SET keypoints = EXCLUDED.keypoints, updated_at = NOW()
      `,
      [userId, chatId, JSON.stringify(normalized)]
    );

    if (this.redis) {
      try {
        const cacheKey = `${this.redisChatKeyPrefix}${userId}:${chatId}`;
        await this.redis.set(cacheKey, JSON.stringify(normalized), 'EX', this.ttlSec);
      } catch {
        // ignore cache errors
      }
    }
  }

  async storeSummary(userId: string, summary: string): Promise<void> {
    if (!this.pool) return;

    await this.pool.query(
      `
      INSERT INTO ai_user_summary (user_id, summary)
      VALUES ($1, $2)
      `,
      [userId, summary]
    );
  }

  async storeChat(userId: string, title: string, messages: any[]): Promise<void> {
    if (!this.pool) return;

    const cleanTitle = String(title).trim().slice(0, 120) || 'Health chat';
    const safeMessages = Array.isArray(messages) ? messages : [];

    await this.pool.query(
      `
      INSERT INTO ai_user_chats (user_id, title, messages)
      VALUES ($1, $2, $3::jsonb)
      `,
      [userId, cleanTitle, JSON.stringify(safeMessages)]
    );
  }

  async listChats(userId: string): Promise<{ id: number; title: string; created_at: string }[]> {
    if (!this.pool) return [];
    const res = await this.pool.query(
      `
      SELECT id, title, created_at
      FROM ai_user_chats
      WHERE user_id = $1
      ORDER BY created_at DESC
      `,
      [userId]
    );
    return res.rows;
  }

  async getChat(userId: string, chatId: number): Promise<any | null> {
    if (!this.pool) return null;
    const res = await this.pool.query(
      `
      SELECT id, title, messages, created_at, updated_at
      FROM ai_user_chats
      WHERE user_id = $1 AND id = $2
      `,
      [userId, chatId]
    );
    return res.rows[0] ?? null;
  }
}
