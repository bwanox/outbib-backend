import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { DoctorsModule } from './doctors/doctors.module';

@Module({
  imports: [PrismaModule, DoctorsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}