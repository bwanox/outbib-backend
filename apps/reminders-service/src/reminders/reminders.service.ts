import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { REDIS_DUE_ZSET_KEY } from '../redis/redis.constants';
import { CreateReminderDto, ReminderTypeDto } from './dto/create-reminder.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';

type ScheduleSourceStatusLiteral = 'ACTIVE' | 'SNOOZED' | 'CANCELLED';

type ScheduleSourceTypeLiteral = 'MEDICATION' | 'APPOINTMENT' | 'WATER_HABIT' | 'NOTE';

const ScheduleSourceStatusConst = {
  ACTIVE: 'ACTIVE',
  SNOOZED: 'SNOOZED',
  CANCELLED: 'CANCELLED',
} as const;

const ScheduleSourceTypeConst = {
  MEDICATION: 'MEDICATION',
  APPOINTMENT: 'APPOINTMENT',
  WATER_HABIT: 'WATER_HABIT',
  NOTE: 'NOTE',
} as const;

@Injectable()
export class RemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  private get redis() {
    return this.redisService.redis;
  }

  async create(userId: string, dto: CreateReminderDto) {
    const nextTriggerAtIso = this.computeNextTriggerAtFromDto(dto);

    const source = await (this.prisma as any)['scheduleSource'].create({
      data: {
        userId,
        type: dto.type as any,
        status: ScheduleSourceStatusConst.ACTIVE,
        title: dto.title,
        notes: dto.notes,
        timezone: dto.timezone,

        appointmentAt: dto.type === ReminderTypeDto.APPOINTMENT ? new Date(dto.appointmentAt) : null,
        location: dto.type === ReminderTypeDto.APPOINTMENT ? dto.location : null,

        dosageText: dto.type === ReminderTypeDto.MEDICATION ? (dto.dosageText ?? null) : null,
        timesOfDay: dto.type === ReminderTypeDto.MEDICATION ? (dto.timesOfDay as any) : null,
        startDate: dto.type === ReminderTypeDto.MEDICATION && dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.type === ReminderTypeDto.MEDICATION && dto.endDate ? new Date(dto.endDate) : null,

        dailyGoalMl: dto.type === ReminderTypeDto.WATER_HABIT ? dto.dailyGoalMl : null,
        nudgeEnabled: dto.type === ReminderTypeDto.WATER_HABIT ? (dto.nudgeEnabled ?? false) : null,
        nudgeEveryMinutes: dto.type === ReminderTypeDto.WATER_HABIT ? (dto.nudgeEveryMinutes ?? null) : null,
        activeHours: dto.type === ReminderTypeDto.WATER_HABIT ? (dto.activeHours ?? null) : null,

        scheduledAt: dto.type === ReminderTypeDto.NOTE && dto.scheduledAt ? new Date(dto.scheduledAt) : null,

        nextTriggerAt: nextTriggerAtIso ? new Date(nextTriggerAtIso) : null,
      },
    });

    await this.syncRedisSchedule(source.id, source.nextTriggerAt);
    return source;
  }

  async listMine(userId: string) {
    return (this.prisma as any)['scheduleSource'].findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(userId: string, id: string, dto: UpdateReminderDto) {
    const existing = await (this.prisma as any)['scheduleSource'].findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw new NotFoundException('Reminder not found');
    if (existing.userId !== userId) throw new ForbiddenException();

    const merged = {
      type: (dto.type ?? existing.type) as ScheduleSourceTypeLiteral,
      title: dto.title ?? existing.title,
      notes: dto.notes ?? existing.notes ?? undefined,
      timezone: dto.timezone ?? existing.timezone,

      appointmentAt: dto.appointmentAt ?? (existing.appointmentAt ? existing.appointmentAt.toISOString() : undefined),
      location: dto.location ?? existing.location ?? undefined,

      dosageText: dto.dosageText ?? existing.dosageText ?? undefined,
      timesOfDay: dto.timesOfDay ?? ((existing.timesOfDay as any) as string[] | undefined),
      startDate: dto.startDate ?? (existing.startDate ? existing.startDate.toISOString() : undefined),
      endDate: dto.endDate ?? (existing.endDate ? existing.endDate.toISOString() : undefined),

      dailyGoalMl: dto.dailyGoalMl ?? existing.dailyGoalMl ?? undefined,
      nudgeEnabled: dto.nudgeEnabled ?? existing.nudgeEnabled ?? undefined,
      nudgeEveryMinutes: dto.nudgeEveryMinutes ?? existing.nudgeEveryMinutes ?? undefined,
      activeHours: dto.activeHours ?? existing.activeHours ?? undefined,

      scheduledAt: dto.scheduledAt ?? (existing.scheduledAt ? existing.scheduledAt.toISOString() : undefined),
    } as any;

    const nextTriggerAtIso = this.computeNextTriggerAtFromMerged(existing.status as any, existing.snoozedUntil, merged);

    const source = await (this.prisma as any)['scheduleSource'].update({
      where: { id },
      data: {
        type: merged.type,
        title: merged.title,
        notes: merged.notes,
        timezone: merged.timezone,

        appointmentAt: merged.type === ScheduleSourceTypeConst.APPOINTMENT ? (merged.appointmentAt ? new Date(merged.appointmentAt) : null) : null,
        location: merged.type === ScheduleSourceTypeConst.APPOINTMENT ? merged.location : null,

        dosageText: merged.type === ScheduleSourceTypeConst.MEDICATION ? (merged.dosageText ?? null) : null,
        timesOfDay: merged.type === ScheduleSourceTypeConst.MEDICATION ? ((merged.timesOfDay as any) ?? null) : null,
        startDate: merged.type === ScheduleSourceTypeConst.MEDICATION && merged.startDate ? new Date(merged.startDate) : null,
        endDate: merged.type === ScheduleSourceTypeConst.MEDICATION && merged.endDate ? new Date(merged.endDate) : null,

        dailyGoalMl: merged.type === ScheduleSourceTypeConst.WATER_HABIT ? (merged.dailyGoalMl ?? null) : null,
        nudgeEnabled: merged.type === ScheduleSourceTypeConst.WATER_HABIT ? (merged.nudgeEnabled ?? null) : null,
        nudgeEveryMinutes: merged.type === ScheduleSourceTypeConst.WATER_HABIT ? (merged.nudgeEveryMinutes ?? null) : null,
        activeHours: merged.type === ScheduleSourceTypeConst.WATER_HABIT ? (merged.activeHours ?? null) : null,

        scheduledAt: merged.type === ScheduleSourceTypeConst.NOTE ? (merged.scheduledAt ? new Date(merged.scheduledAt) : null) : null,

        nextTriggerAt: nextTriggerAtIso ? new Date(nextTriggerAtIso) : null,
      },
    });

    await this.syncRedisSchedule(source.id, source.nextTriggerAt);
    return source;
  }

  async softDelete(userId: string, id: string) {
    const existing = await (this.prisma as any)['scheduleSource'].findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw new NotFoundException('Reminder not found');
    if (existing.userId !== userId) throw new ForbiddenException();

    const source = await (this.prisma as any)['scheduleSource'].update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: ScheduleSourceStatusConst.CANCELLED,
        nextTriggerAt: null,
      },
    });

    await this.redis.zrem(REDIS_DUE_ZSET_KEY, id);
    return source;
  }

  async snooze(userId: string, id: string, snoozedUntilIso: string) {
    const existing = await (this.prisma as any)['scheduleSource'].findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw new NotFoundException('Reminder not found');
    if (existing.userId !== userId) throw new ForbiddenException();

    const snoozedUntil = new Date(snoozedUntilIso);
    if (Number.isNaN(snoozedUntil.getTime())) throw new BadRequestException('Invalid snoozedUntil');

    const source = await (this.prisma as any)['scheduleSource'].update({
      where: { id },
      data: {
        status: ScheduleSourceStatusConst.SNOOZED,
        snoozedUntil,
        nextTriggerAt: snoozedUntil,
      },
    });

    await this.syncRedisSchedule(source.id, source.nextTriggerAt);
    return source;
  }

  async rebuildCacheFromPostgres() {
    const sources = await (this.prisma as any)['scheduleSource'].findMany({
      where: {
        deletedAt: null,
        status: { in: [ScheduleSourceStatusConst.ACTIVE, ScheduleSourceStatusConst.SNOOZED] },
        nextTriggerAt: { not: null },
      },
      select: { id: true, nextTriggerAt: true },
    });

    if (!sources.length) return { rebuilt: 0 };

    const pipeline = this.redis.pipeline();
    for (const s of sources) {
      pipeline.zadd(REDIS_DUE_ZSET_KEY, s.nextTriggerAt!.getTime(), s.id);
    }
    await pipeline.exec();

    return { rebuilt: sources.length };
  }

  private async syncRedisSchedule(sourceId: string, nextTriggerAt: Date | null) {
    if (!nextTriggerAt) {
      await this.redis.zrem(REDIS_DUE_ZSET_KEY, sourceId);
      return;
    }
    await this.redis.zadd(REDIS_DUE_ZSET_KEY, nextTriggerAt.getTime(), sourceId);
  }

  private computeNextTriggerAtFromDto(dto: CreateReminderDto): string | null {
    if (dto.type === ReminderTypeDto.APPOINTMENT) {
      return dto.appointmentAt;
    }

    if (dto.type === ReminderTypeDto.NOTE) {
      return dto.scheduledAt ?? null;
    }

    // WATER_HABIT: not schedule-indexed by default (tracking-only). Return null.
    if (dto.type === ReminderTypeDto.WATER_HABIT) {
      return null;
    }

    // MEDICATION (daily times)
    const start = dto.startDate
      ? DateTime.fromISO(dto.startDate, { zone: dto.timezone })
      : DateTime.now().setZone(dto.timezone);
    const now = DateTime.now().setZone(dto.timezone);
    const from = start > now ? start : now;

    const next = this.nextTimeOfDay(from, dto.timesOfDay, dto.timezone);
    if (!next) return null;

    if (dto.endDate) {
      const end = DateTime.fromISO(dto.endDate, { zone: dto.timezone }).endOf('day');
      if (next > end) return null;
    }

    return next.toUTC().toISO();
  }

  private computeNextTriggerAtFromMerged(
    status: ScheduleSourceStatusLiteral,
    snoozedUntil: Date | null,
    merged: {
      type: ScheduleSourceTypeLiteral;
      timezone: string;
      appointmentAt?: string;
      timesOfDay?: string[];
      startDate?: string;
      endDate?: string;
      scheduledAt?: string;
    },
  ): string | null {
    if (status === ScheduleSourceStatusConst.SNOOZED && snoozedUntil) {
      return snoozedUntil.toISOString();
    }

    if (merged.type === ScheduleSourceTypeConst.APPOINTMENT) {
      return merged.appointmentAt ?? null;
    }

    if (merged.type === ScheduleSourceTypeConst.NOTE) {
      return merged.scheduledAt ?? null;
    }

    if (merged.type === ScheduleSourceTypeConst.WATER_HABIT) {
      return null;
    }

    if (!merged.timesOfDay?.length) return null;

    const now = DateTime.now().setZone(merged.timezone);
    const start = merged.startDate ? DateTime.fromISO(merged.startDate, { zone: merged.timezone }) : now;
    const from = start > now ? start : now;

    const next = this.nextTimeOfDay(from, merged.timesOfDay, merged.timezone);
    if (!next) return null;

    if (merged.endDate) {
      const end = DateTime.fromISO(merged.endDate, { zone: merged.timezone }).endOf('day');
      if (next > end) return null;
    }

    return next.toUTC().toISO();
  }

  private nextTimeOfDay(from: DateTime, timesOfDay: string[], zone: string): DateTime | null {
    const parsed = timesOfDay
      .map((t) => {
        const [hh, mm] = t.split(':').map((x) => Number(x));
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
        return { hh, mm, raw: t };
      })
      .filter(Boolean) as Array<{ hh: number; mm: number; raw: string }>;

    if (!parsed.length) throw new BadRequestException('Invalid timesOfDay');

    const sorted = parsed.sort((a, b) => a.hh * 60 + a.mm - (b.hh * 60 + b.mm));

    // Try today
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

    // Otherwise tomorrow at earliest time
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
