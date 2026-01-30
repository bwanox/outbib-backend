import { Controller, Get, Param, Post, Query, Req, UseGuards, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CalendarService } from './calendar.service';
import { CalendarRangeQueryDto } from './dto/calendar-range-query.dto';
import { CalendarDayQueryDto } from './dto/calendar-day-query.dto';
import { SnoozeOccurrenceDto } from './dto/snooze-occurrence.dto';

@ApiTags('calendar')
@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Occurrences in range' })
  async range(@Req() req: any, @Query() q: CalendarRangeQueryDto) {
    const userId = req.user?.sub as string;
    return this.calendarService.getRange(userId, q.from, q.to);
  }

  @Get('day')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async day(@Req() req: any, @Query() q: CalendarDayQueryDto) {
    const userId = req.user?.sub as string;
    return this.calendarService.getDay(userId, q.date, q.tz);
  }

  @Post('events/:eventId/complete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async complete(@Req() req: any, @Param('eventId') eventId: string) {
    const userId = req.user?.sub as string;
    return this.calendarService.complete(userId, eventId);
  }

  @Post('events/:eventId/skip')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async skip(@Req() req: any, @Param('eventId') eventId: string) {
    const userId = req.user?.sub as string;
    return this.calendarService.skip(userId, eventId);
  }

  @Post('events/:eventId/snooze')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async snooze(@Req() req: any, @Param('eventId') eventId: string, @Body() dto: SnoozeOccurrenceDto) {
    const userId = req.user?.sub as string;
    return this.calendarService.snooze(userId, eventId, dto.snoozedUntil);
  }
}
