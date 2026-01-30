import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { REDIS_DUE_ZSET_KEY } from '../redis/redis.constants';
import { ReminderEventsPublisher } from '../events/reminder-events.publisher';

type ScheduleSourceStatusLiteral = 'ACTIVE' | 'SNOOZED' | 'CANCELLED';

type ScheduleSourceTypeLiteral = 'MEDICATION' | 'APPOINTMENT' | 'WATER_HABIT' | 'NOTE';

const ScheduleSourceStatusConst = {
  ACTIVE: 'ACTIVE',
  SNOOZED: 'SNOOZED',
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
    const sources = await (this.prisma as any)['scheduleSource'].findMany({
      where: {
        deletedAt: null,
        status: { in: [ScheduleSourceStatusConst.ACTIVE, ScheduleSourceStatusConst.SNOOZED] as ScheduleSourceStatusLiteral[] },
        nextTriggerAt: { not: null },
      },
      select: { id: true, nextTriggerAt: true },
    });

    const pipeline = this.redis.pipeline();
    for (const s of sources) {
      pipeline.zadd(REDIS_DUE_ZSET_KEY, s.nextTriggerAt!.getTime(), s.id);
    }
    await pipeline.exec();

    this.logger.log(`Rebuilt Redis schedule from Postgres: ${sources.length} sources`);
  }

  private async tick() {
    const nowMs = Date.now();

    // Fetch due IDs from Redis (fast)
    const dueIds = await this.redis.zrangebyscore(REDIS_DUE_ZSET_KEY, 0, nowMs, 'LIMIT', 0, this.batchSize);
    if (!dueIds.length) return;

    for (const id of dueIds) {
      await this.processSource(id);
    }
  }

  private async processSource(sourceId: string) {
    const source = await (this.prisma as any)['scheduleSource'].findUnique({ where: { id: sourceId } });
    if (!source || source.deletedAt || !source.nextTriggerAt) {
      await this.redis.zrem(REDIS_DUE_ZSET_KEY, sourceId);
      return;
    }

    const now = new Date();
    if (source.nextTriggerAt.getTime() > now.getTime()) {
      // stale Redis entry; fix score
      await this.redis.zadd(REDIS_DUE_ZSET_KEY, source.nextTriggerAt.getTime(), sourceId);
      return;
    }

    if (source.status !== ScheduleSourceStatusConst.ACTIVE && source.status !== ScheduleSourceStatusConst.SNOOZED) {
      await this.redis.zrem(REDIS_DUE_ZSET_KEY, sourceId);
      return;
    }

    // Materialize/Upsert occurrence for timeline state.
    const occurrence = await (this.prisma as any)['calendarOccurrence'].upsert({
      where: {
        sourceId_scheduledAt: {
          sourceId: source.id,
          scheduledAt: source.nextTriggerAt,
        },
      },
      create: {
        userId: source.userId,
        sourceId: source.id,
        scheduledAt: source.nextTriggerAt,
        timezone: source.timezone,
        status: 'SCHEDULED',
      },
      update: {
        // If it already exists, do not overwrite a user-updated status.
      },
    });

    // Publish due event
    await this.publisher.publishReminderDue({
      reminderId: source.id, // backward compat
      sourceId: source.id,
      userId: source.userId,
      type: source.type as any,
      title: source.title,
      scheduledFor: source.nextTriggerAt.toISOString(),
      triggeredAt: now.toISOString(),
    });

    // Compute the next trigger.
    const nextTriggerAt = this.computeNextTriggerAtAfterDue(source.type as any, source, source.nextTriggerAt);

    await (this.prisma as any)['scheduleSource'].update({
      where: { id: sourceId },
      data: {
        status: ScheduleSourceStatusConst.ACTIVE,
        lastTriggeredAt: now,
        snoozedUntil: null,
        nextTriggerAt,
      },
    });

    if (!nextTriggerAt) {
      await this.redis.zrem(REDIS_DUE_ZSET_KEY, sourceId);
    } else {
      await this.redis.zadd(REDIS_DUE_ZSET_KEY, nextTriggerAt.getTime(), sourceId);
    }

    // Keep linter from complaining about unused var in some configs.
    void occurrence;
  }

  private computeNextTriggerAtAfterDue(
    type: ScheduleSourceTypeLiteral,
    source: {
      timezone: string;
      timesOfDay: any;
      endDate: Date | null;
    },
    justTriggeredAt: Date,
  ): Date | null {
    if (type === 'APPOINTMENT' || type === 'NOTE') {
      return null;
    }

    if (type === 'WATER_HABIT') {
      return null;
    }

    // MEDICATION: recompute next execution from just-after current trigger.
    const times = (source.timesOfDay as string[] | null) ?? [];
    if (!times.length) return null;

    const zone = source.timezone;
    const from = DateTime.fromJSDate(justTriggeredAt, { zone }).plus({ minutes: 1 });

    const next = this.nextTimeOfDay(from, times, zone);
    if (!next) return null;

    if (source.endDate) {
      const end = DateTime.fromJSDate(source.endDate, { zone }).endOf('day');
      if (next > end) return null;
    }

    return next.toUTC().toJSDate();
  }

  private nextTimeOfDay(from: DateTime, timesOfDay: string[], zone: string): DateTime | null {
    const parsed = timesOfDay
      .map((t) => {
        const [hh, mm] = t.split(':').map((x) => Number(x));
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
        return { hh, mm };
      })
      .filter(Boolean) as Array<{ hh: number; mm: number }>;

    if (!parsed.length) return null;

    const sorted = parsed.sort((a, b) => a.hh * 60 + a.mm - (b.hh * 60 + b.mm));

    for (const t of sorted) {
      const candidate = DateTime.fromObject(
        {
          year: from.year,
          month: from.month,
          day: from.day,
          hour: t.hh,
          minute: t.mm,
          second: 0,
          millisecond: 0,
        },
        { zone },
      );
      if (candidate >= from) return candidate;
    }

    const first = sorted[0];
    return DateTime.fromObject(
      {
        year: from.plus({ days: 1 }).year,
        month: from.plus({ days: 1 }).month,
        day: from.plus({ days: 1 }).day,
        hour: first.hh,
        minute: first.mm,
        second: 0,
        millisecond: 0,
      },
      { zone },
    );
  }
}
