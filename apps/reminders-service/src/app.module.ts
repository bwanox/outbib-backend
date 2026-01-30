import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RemindersModule } from './reminders/reminders.module';
import { CalendarModule } from './calendar/calendar.module';
import { TrackersModule } from './trackers/trackers.module';

@Module({
  imports: [RemindersModule, CalendarModule, TrackersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
