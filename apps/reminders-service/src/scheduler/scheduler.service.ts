import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { REDIS_DUE_ZSET_KEY } from '../redis/redis.constants';
import { ReminderEventsPublisher } from '../events/reminder-events.publisher';

type ReminderStatusLiteral = 'ACTIVE' | 'SNOOZED' | 'COMPLETED' | 'CANCELLED';

const ReminderStatusConst = {
  ACTIVE: 'ACTIVE',
  SNOOZED: 'SNOOZED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  private readonly tickMs = Number(process.env.SCHEDULER_TICK_MS ?? 1000);
  private readonly batchSize = Number(process.env.SCHEDULER_BATCH_SIZE ?? 50);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly publisher: ReminderEventsPublisher,
  ) {}

  private get redis() {
    return this.redisService.redis;
  }

  async onModuleInit() {
    const disabled = (process.env.SCHEDULER_DISABLED || 'false').toLowerCase() === 'true';
    if (disabled) {
      this.logger.warn('SCHEDULER_DISABLED=true; scheduler not started');
      return;
    }

    // Rebuild schedule on startup so Redis flush doesn't break reminders.
    await this.rebuildRedisZset();

    setInterval(() => {
      this.tick().catch((e) => this.logger.error('Scheduler tick failed', e as any));
    }, this.tickMs);

    this.logger.log(`Scheduler started (tickMs=${this.tickMs}, batchSize=${this.batchSize})`);
  }

  private async rebuildRedisZset() {
    const reminders = await this.prisma.reminder.findMany({
      where: {
        deletedAt: null,
        status: { in: [ReminderStatusConst.ACTIVE, ReminderStatusConst.SNOOZED] as ReminderStatusLiteral[] },
        nextTriggerAt: { not: null },
      },
      select: { id: true, nextTriggerAt: true },
    });

    const pipeline = this.redis.pipeline();
    for (const r of reminders) {
      pipeline.zadd(REDIS_DUE_ZSET_KEY, r.nextTriggerAt!.getTime(), r.id);
    }
    await pipeline.exec();

    this.logger.log(`Rebuilt Redis schedule from Postgres: ${reminders.length} reminders`);
  }

  private async tick() {
    const nowMs = Date.now();

    // Fetch due IDs from Redis (fast)
    const dueIds = await this.redis.zrangebyscore(REDIS_DUE_ZSET_KEY, 0, nowMs, 'LIMIT', 0, this.batchSize);
    if (!dueIds.length) return;

    for (const id of dueIds) {
      await this.processReminder(id);
    }
  }

  private async processReminder(reminderId: string) {
    const reminder = await this.prisma.reminder.findUnique({ where: { id: reminderId } });
    if (!reminder || reminder.deletedAt || !reminder.nextTriggerAt) {
      await this.redis.zrem(REDIS_DUE_ZSET_KEY, reminderId);
      return;
    }

    const now = new Date();
    if (reminder.nextTriggerAt.getTime() > now.getTime()) {
      // stale Redis entry; fix score
      await this.redis.zadd(REDIS_DUE_ZSET_KEY, reminder.nextTriggerAt.getTime(), reminderId);
      return;
    }

    if (reminder.status !== ReminderStatusConst.ACTIVE && reminder.status !== ReminderStatusConst.SNOOZED) {
      await this.redis.zrem(REDIS_DUE_ZSET_KEY, reminderId);
      return;
    }

    // Publish due event
    await this.publisher.publishReminderDue({
      reminderId: reminder.id,
      userId: reminder.userId,
      type: reminder.type,
      title: reminder.title,
      scheduledFor: reminder.nextTriggerAt.toISOString(),
      triggeredAt: now.toISOString(),
    });

    // Update state: for appointment -> complete, for medication -> compute next occurrence.
    if (reminder.type === 'APPOINTMENT') {
      await this.prisma.reminder.update({
        where: { id: reminderId },
        data: {
          status: ReminderStatusConst.COMPLETED,
          lastTriggeredAt: now,
          nextTriggerAt: null,
          snoozedUntil: null,
        },
      });
      await this.redis.zrem(REDIS_DUE_ZSET_KEY, reminderId);
      return;
    }

    // Medication: naive recurrence: add 1 day keeping the same time (based on nextTriggerAt)
    // This is acceptable for MVP; can be replaced with full timezone-aware recomputation.
    const next = new Date(reminder.nextTriggerAt.getTime() + 24 * 60 * 60 * 1000);

    // Respect endDate if provided
    if (reminder.endDate && next.getTime() > reminder.endDate.getTime()) {
      await this.prisma.reminder.update({
        where: { id: reminderId },
        data: {
          status: ReminderStatusConst.COMPLETED,
          lastTriggeredAt: now,
          nextTriggerAt: null,
          snoozedUntil: null,
        },
      });
      await this.redis.zrem(REDIS_DUE_ZSET_KEY, reminderId);
      return;
    }

    await this.prisma.reminder.update({
      where: { id: reminderId },
      data: {
        status: ReminderStatusConst.ACTIVE,
        lastTriggeredAt: now,
        snoozedUntil: null,
        nextTriggerAt: next,
      },
    });

    await this.redis.zadd(REDIS_DUE_ZSET_KEY, next.getTime(), reminderId);
  }
}
