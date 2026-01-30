import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TrackersService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeDate(date: string): string {
    // Expect YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('Invalid date');
    return date;
  }

  async logWater(userId: string, amountMl: number, atIso?: string, dateOverride?: string) {
    const at = atIso ? new Date(atIso) : new Date();
    if (Number.isNaN(at.getTime())) throw new BadRequestException('Invalid at');

    const date = this.normalizeDate(dateOverride ?? at.toISOString().slice(0, 10));

    const log = await (this.prisma as any)['waterLog'].upsert({
      where: { userId_date: { userId, date } },
      create: {
        userId,
        date,
        totalMl: amountMl,
        entries: {
          create: [{ at, amountMl }],
        },
      },
      update: {
        totalMl: { increment: amountMl },
        entries: {
          create: [{ at, amountMl }],
        },
      },
      include: { entries: { orderBy: { at: 'asc' } } },
    });

    // Attach daily goal from the user's WATER_HABIT (if any).
    const habit = await (this.prisma as any)['scheduleSource'].findFirst({
      where: { userId, type: 'WATER_HABIT', deletedAt: null, status: { not: 'CANCELLED' } },
      select: { dailyGoalMl: true },
      orderBy: { createdAt: 'desc' },
    });

    return { ...log, dailyGoalMl: habit?.dailyGoalMl ?? null };
  }

  async getWater(userId: string, date: string) {
    const normalized = this.normalizeDate(date);

    const log = await (this.prisma as any)['waterLog'].findUnique({
      where: { userId_date: { userId, date: normalized } },
      include: { entries: { orderBy: { at: 'asc' } } },
    });

    const habit = await (this.prisma as any)['scheduleSource'].findFirst({
      where: { userId, type: 'WATER_HABIT', deletedAt: null, status: { not: 'CANCELLED' } },
      select: { dailyGoalMl: true },
      orderBy: { createdAt: 'desc' },
    });

    return {
      userId,
      date: normalized,
      totalMl: log?.totalMl ?? 0,
      entries: log?.entries ?? [],
      dailyGoalMl: habit?.dailyGoalMl ?? null,
    };
  }
}
