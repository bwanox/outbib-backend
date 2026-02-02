import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client?: Redis;

  constructor(private readonly configService: ConfigService) {}

  get redis(): Redis | undefined {
    return this.client;
  }

  async onModuleInit() {
    const url = this.configService.get<string>('REDIS_URL') || 'redis://redis:6379';
    this.client = new Redis(url, { lazyConnect: true });
    this.client.on('error', (err) => {
      this.logger.error('Redis error', err as any);
    });

    try {
      await this.client.connect();
      this.logger.log('Redis connected');
    } catch {
      this.logger.warn('Redis not available; cache disabled');
      this.client = undefined;
    }
  }

  async onModuleDestroy() {
    await this.client?.quit();
  }
}
