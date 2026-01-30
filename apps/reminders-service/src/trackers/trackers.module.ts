import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TrackersController } from './trackers.controller';
import { TrackersService } from './trackers.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret',
    }),
  ],
  controllers: [TrackersController],
  providers: [TrackersService, PrismaService, JwtAuthGuard],
})
export class TrackersModule {}
