import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';

type OccurrenceResponseDto = {
  eventId: string;
  sourceId?: string;
  type: 'MEDICATION' | 'APPOINTMENT' | 'HABIT' | 'NOTE';
  title: string;
  scheduledAt?: string;
  allDay?: boolean;
  status: 'SCHEDULED' | 'DONE' | 'SKIPPED' | 'MISSED' | 'CANCELLED';
  notes?: string | null;
  location?: string | null;
};

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async getRange(userId: string, fromIso: string, toIso: string) {
    const from = new Date(fromIso);
    const to = new Date(toIso);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid from/to');
    }

    const items = await this.buildOccurrences(userId, from, to);
    return { items };
  }

  async getDay(userId: string, date: string, tz: string) {
    const start = DateTime.fromISO(date, { zone: tz }).startOf('day');
    if (!start.isValid) throw new BadRequestException('Invalid date/tz');
    const end = start.endOf('day');

    const items = await this.buildOccurrences(userId, start.toUTC().toJSDate(), end.toUTC().toJSDate());
    return { date, tz, items };
  }

  async complete(userId: string, eventId: string) {
    const existing = await (this.prisma as any)['calendarOccurrence'].findUnique({ where: { id: eventId } });
    if (!existing) throw new NotFoundException('Occurrence not found');
    if (existing.userId !== userId) throw new ForbiddenException();

    return (this.prisma as any)['calendarOccurrence'].update({
      where: { id: eventId },
      data: {
        status: 'DONE',
        completedAt: new Date(),
      },
    });
  }

  async skip(userId: string, eventId: string) {
    const existing = await (this.prisma as any)['calendarOccurrence'].findUnique({ where: { id: eventId } });
    if (!existing) throw new NotFoundException('Occurrence not found');
    if (existing.userId !== userId) throw new ForbiddenException();

    return (this.prisma as any)['calendarOccurrence'].update({
      where: { id: eventId },
      data: {
        status: 'SKIPPED',
        skippedAt: new Date(),
      },
    });
  }

  async snooze(userId: string, eventId: string, snoozedUntilIso: string) {
    const existing = await (this.prisma as any)['calendarOccurrence'].findUnique({ where: { id: eventId }, include: { source: true } });
    if (!existing) throw new NotFoundException('Occurrence not found');
    if (existing.userId !== userId) throw new ForbiddenException();

    const snoozedUntil = new Date(snoozedUntilIso);
    if (Number.isNaN(snoozedUntil.getTime())) throw new BadRequestException('Invalid snoozedUntil');

    // Occurrence-level snooze marker
    const updated = await (this.prisma as any)['calendarOccurrence'].update({
      where: { id: eventId },
      data: {
        snoozedUntil,
      },
    });

    // If this occurrence corresponds to the source's nextTriggerAt, also snooze the source (engine behavior).
    if (existing.source.nextTriggerAt && existing.source.nextTriggerAt.getTime() === existing.scheduledAt.getTime()) {
      await (this.prisma as any)['scheduleSource'].update({
        where: { id: existing.sourceId },
        data: {
          status: 'SNOOZED',
          snoozedUntil,
          nextTriggerAt: snoozedUntil,
        },
      });
    }

    return updated;
  }

  private async buildOccurrences(userId: string, from: Date, to: Date): Promise<OccurrenceResponseDto[]> {
    const existing = await (this.prisma as any)['calendarOccurrence'].findMany({
      where: { userId, scheduledAt: { gte: from, lte: to } },
      orderBy: { scheduledAt: 'asc' },
      include: { source: true },
    });

    const byKey = new Map<string, any>();
    for (const occ of existing) {
      const key = `${occ.sourceId}:${occ.scheduledAt.toISOString()}`;
      byKey.set(key, occ);
    }

    const sources = await (this.prisma as any)['scheduleSource'].findMany({
      where: {
        userId,
        deletedAt: null,
        status: { in: ['ACTIVE', 'SNOOZED'] },
      },
    });

    for (const source of sources) {
      if (source.type === 'APPOINTMENT' && source.appointmentAt) {
        await this.ensureOccurrence(userId, source, source.appointmentAt, from, to, byKey);
        continue;
      }
      if (source.type === 'NOTE' && source.scheduledAt) {
        await this.ensureOccurrence(userId, source, source.scheduledAt, from, to, byKey);
        continue;
      }
      if (source.type === 'MEDICATION') {
        await this.materializeMedicationOccurrences(userId, source, from, to, byKey);
        continue;
      }
    }

    const items = Array.from(byKey.values()).map((occ) => this.toDto(occ));
    items.sort((a, b) => {
      const aTime = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0;
      const bTime = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0;
      return aTime - bTime;
    });
    return items;
  }

  private async ensureOccurrence(
    userId: string,
    source: any,
    scheduledAt: Date,
    from: Date,
    to: Date,
    byKey: Map<string, any>,
  ) {
    if (scheduledAt < from || scheduledAt > to) return;
    const key = `${source.id}:${scheduledAt.toISOString()}`;
    if (byKey.has(key)) return;

    const occ = await (this.prisma as any)['calendarOccurrence'].upsert({
      where: {
        sourceId_scheduledAt: {
          sourceId: source.id,
          scheduledAt,
        },
      },
      create: {
        userId,
        sourceId: source.id,
        scheduledAt,
        timezone: source.timezone,
        status: 'SCHEDULED',
      },
      update: {},
      include: { source: true },
    });
    byKey.set(key, occ);
  }

  private async materializeMedicationOccurrences(
    userId: string,
    source: any,
    from: Date,
    to: Date,
    byKey: Map<string, any>,
  ) {
    const times = (source.timesOfDay as string[] | null) ?? [];
    if (!times.length) return;

    const zone = source.timezone || 'UTC';
    const fromZ = DateTime.fromJSDate(from, { zone }).startOf('day');
    const toZ = DateTime.fromJSDate(to, { zone }).startOf('day');

    const startDate = source.startDate ? DateTime.fromJSDate(source.startDate, { zone }).startOf('day') : null;
    const endDate = source.endDate ? DateTime.fromJSDate(source.endDate, { zone }).endOf('day') : null;

    for (let cursor = fromZ; cursor <= toZ; cursor = cursor.plus({ days: 1 })) {
      for (const t of times) {
        const [hh, mm] = t.split(':').map((x) => Number(x));
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) continue;

        const candidate = cursor.set({ hour: hh, minute: mm, second: 0, millisecond: 0 });
        if (startDate && candidate < startDate) continue;
        if (endDate && candidate > endDate) continue;

        const scheduledAt = candidate.toUTC().toJSDate();
        await this.ensureOccurrence(userId, source, scheduledAt, from, to, byKey);
      }
    }
  }

  private toDto(occ: any): OccurrenceResponseDto {
    const source = occ.source;
    const type =
      source.type === 'WATER_HABIT' ? 'HABIT' : (source.type as 'MEDICATION' | 'APPOINTMENT' | 'NOTE');

    return {
      eventId: occ.id,
      sourceId: occ.sourceId,
      type,
      title: source.title,
      scheduledAt: occ.scheduledAt ? occ.scheduledAt.toISOString() : undefined,
      status: occ.status,
      notes: source.notes ?? null,
      location: source.location ?? null,
    };
  }
}
