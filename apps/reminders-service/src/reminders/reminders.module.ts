import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ReminderEventsPublisher } from '../events/reminder-events.publisher';
import { SchedulerService } from '../scheduler/scheduler.service';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret',
    }),
  ],
  controllers: [RemindersController],
  providers: [
    RemindersService,
    PrismaService,
    RedisService,
    ReminderEventsPublisher,
    SchedulerService,
    JwtAuthGuard,
  ],
})
export class RemindersModule {}
