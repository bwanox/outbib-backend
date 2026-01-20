import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RemindersModule } from './reminders/reminders.module';

@Module({
  imports: [RemindersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
