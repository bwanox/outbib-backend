import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { SnoozeDto } from './dto/snooze.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { RemindersService } from './reminders.service';

@ApiTags('reminders')
@Controller('reminders')
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async create(@Req() req: any, @Body() dto: CreateReminderDto) {
    const userId = req.user?.sub as string;
    return this.remindersService.create(userId, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async listMine(@Req() req: any) {
    const userId = req.user?.sub as string;
    return this.remindersService.listMine(userId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateReminderDto) {
    const userId = req.user?.sub as string;
    return this.remindersService.update(userId, id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async delete(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.sub as string;
    return this.remindersService.softDelete(userId, id);
  }

  @Post(':id/snooze')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async snooze(@Req() req: any, @Param('id') id: string, @Body() dto: SnoozeDto) {
    const userId = req.user?.sub as string;
    return this.remindersService.snooze(userId, id, dto.snoozedUntil);
  }

  @Post('rebuild-cache')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Rebuild redis ZSET from Postgres (admin in future)' })
  async rebuildCache() {
    return this.remindersService.rebuildCacheFromPostgres();
  }
}
