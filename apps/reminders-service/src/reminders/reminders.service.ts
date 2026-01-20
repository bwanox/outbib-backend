import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { REDIS_DUE_ZSET_KEY } from '../redis/redis.constants';
import { CreateReminderDto, ReminderTypeDto } from './dto/create-reminder.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';

type ReminderStatusLiteral = 'ACTIVE' | 'SNOOZED' | 'COMPLETED' | 'CANCELLED';
type ReminderTypeLiteral = 'MEDICATION' | 'APPOINTMENT';

const ReminderStatusConst = {
  ACTIVE: 'ACTIVE',
  SNOOZED: 'SNOOZED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

const ReminderTypeConst = {
  MEDICATION: 'MEDICATION',
  APPOINTMENT: 'APPOINTMENT',
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
    const nextTriggerAt = this.computeNextTriggerAtFromDto(dto);

    const reminder = await this.prisma.reminder.create({
      data: {
        userId,
        type: dto.type as any,
        status: ReminderStatusConst.ACTIVE,
        title: dto.title,
        notes: dto.notes,
        timezone: dto.timezone,
        appointmentAt: dto.type === ReminderTypeDto.APPOINTMENT ? new Date(dto.appointmentAt) : null,
        location: dto.type === ReminderTypeDto.APPOINTMENT ? dto.location : null,
        dosageText: dto.type === ReminderTypeDto.MEDICATION ? dto.dosageText : null,
        timesOfDay: dto.type === ReminderTypeDto.MEDICATION ? (dto.timesOfDay as any) : null,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        nextTriggerAt: nextTriggerAt ? new Date(nextTriggerAt) : null,
      },
    });

    await this.syncRedisSchedule(reminder.id, reminder.nextTriggerAt);
    return reminder;
  }

  async listMine(userId: string) {
    return this.prisma.reminder.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(userId: string, id: string, dto: UpdateReminderDto) {
    const existing = await this.prisma.reminder.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw new NotFoundException('Reminder not found');
    if (existing.userId !== userId) throw new ForbiddenException();

    const merged = {
      type: (dto.type ?? existing.type) as any,
      title: dto.title ?? existing.title,
      notes: dto.notes ?? existing.notes ?? undefined,
      timezone: dto.timezone ?? existing.timezone,
      appointmentAt: dto.appointmentAt ?? (existing.appointmentAt ? existing.appointmentAt.toISOString() : undefined),
      location: dto.location ?? existing.location ?? undefined,
      dosageText: dto.dosageText ?? existing.dosageText ?? undefined,
      timesOfDay: dto.timesOfDay ?? ((existing.timesOfDay as any) as string[] | undefined),
      startDate: dto.startDate ?? (existing.startDate ? existing.startDate.toISOString() : undefined),
      endDate: dto.endDate ?? (existing.endDate ? existing.endDate.toISOString() : undefined),
    } as any;

    const nextTriggerAt = this.computeNextTriggerAtFromMerged(existing.status, existing.snoozedUntil, merged);

    const reminder = await this.prisma.reminder.update({
      where: { id },
      data: {
        type: merged.type,
        title: merged.title,
        notes: merged.notes,
        timezone: merged.timezone,
        appointmentAt: merged.type === ReminderTypeConst.APPOINTMENT ? (merged.appointmentAt ? new Date(merged.appointmentAt) : null) : null,
        location: merged.type === ReminderTypeConst.APPOINTMENT ? merged.location : null,
        dosageText: merged.type === ReminderTypeConst.MEDICATION ? merged.dosageText : null,
        timesOfDay: merged.type === ReminderTypeConst.MEDICATION ? ((merged.timesOfDay as any) ?? null) : null,
        startDate: merged.startDate ? new Date(merged.startDate) : null,
        endDate: merged.endDate ? new Date(merged.endDate) : null,
        nextTriggerAt: nextTriggerAt ? new Date(nextTriggerAt) : null,
      },
    });

    await this.syncRedisSchedule(reminder.id, reminder.nextTriggerAt);
    return reminder;
  }

  async softDelete(userId: string, id: string) {
    const existing = await this.prisma.reminder.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw new NotFoundException('Reminder not found');
    if (existing.userId !== userId) throw new ForbiddenException();

    const reminder = await this.prisma.reminder.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: ReminderStatusConst.CANCELLED,
        nextTriggerAt: null,
      },
    });

    await this.redis.zrem(REDIS_DUE_ZSET_KEY, id);
    return reminder;
  }

  async snooze(userId: string, id: string, snoozedUntilIso: string) {
    const existing = await this.prisma.reminder.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw new NotFoundException('Reminder not found');
    if (existing.userId !== userId) throw new ForbiddenException();

    const snoozedUntil = new Date(snoozedUntilIso);
    if (Number.isNaN(snoozedUntil.getTime())) throw new BadRequestException('Invalid snoozedUntil');

    const reminder = await this.prisma.reminder.update({
      where: { id },
      data: {
        status: ReminderStatusConst.SNOOZED,
        snoozedUntil,
        nextTriggerAt: snoozedUntil,
      },
    });

    await this.syncRedisSchedule(reminder.id, reminder.nextTriggerAt);
    return reminder;
  }

  async rebuildCacheFromPostgres() {
    const reminders = await this.prisma.reminder.findMany({
      where: {
        deletedAt: null,
        status: { in: [ReminderStatusConst.ACTIVE, ReminderStatusConst.SNOOZED] },
        nextTriggerAt: { not: null },
      },
      select: { id: true, nextTriggerAt: true },
    });

    if (!reminders.length) return { rebuilt: 0 };

    const pipeline = this.redis.pipeline();
    for (const r of reminders) {
      pipeline.zadd(REDIS_DUE_ZSET_KEY, r.nextTriggerAt!.getTime(), r.id);
    }
    await pipeline.exec();

    return { rebuilt: reminders.length };
  }

  private async syncRedisSchedule(reminderId: string, nextTriggerAt: Date | null) {
    if (!nextTriggerAt) {
      await this.redis.zrem(REDIS_DUE_ZSET_KEY, reminderId);
      return;
    }
    await this.redis.zadd(REDIS_DUE_ZSET_KEY, nextTriggerAt.getTime(), reminderId);
  }

  private computeNextTriggerAtFromDto(dto: CreateReminderDto): string | null {
    if (dto.type === ReminderTypeDto.APPOINTMENT) {
      return dto.appointmentAt;
    }

    // MEDICATION (daily times)
    const start = dto.startDate ? DateTime.fromISO(dto.startDate, { zone: dto.timezone }) : DateTime.now().setZone(dto.timezone);
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
    status: ReminderStatusLiteral,
    snoozedUntil: Date | null,
    merged: {
      type: ReminderTypeLiteral;
      timezone: string;
      appointmentAt?: string;
      timesOfDay?: string[];
      startDate?: string;
      endDate?: string;
    },
  ): string | null {
    if (status === ReminderStatusConst.SNOOZED && snoozedUntil) {
      return snoozedUntil.toISOString();
    }

    if (merged.type === ReminderTypeConst.APPOINTMENT) {
      return merged.appointmentAt ?? null;
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
