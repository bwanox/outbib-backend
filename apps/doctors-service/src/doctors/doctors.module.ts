import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios'; // <--- Import
import { ConfigModule } from '@nestjs/config'; // <--- Import
import { DoctorsService } from './doctors.service';
import { DoctorsController } from './doctors.controller';
import { MapsService } from './maps.service'; // <--- Import
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule, 
    HttpModule, 
    ConfigModule.forRoot() // Load .env vars
  ],
  controllers: [DoctorsController],
  providers: [DoctorsService, MapsService], // <--- Add MapsService
})
export class DoctorsModule {}