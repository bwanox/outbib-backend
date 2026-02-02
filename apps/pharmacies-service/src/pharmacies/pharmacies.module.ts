import { Module } from '@nestjs/common';
import { PharmaciesController } from './pharmacies.controller';
import { PharmaciesService } from './pharmacies.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { GooglePlacesProvider } from './providers/google-places.provider';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [PharmaciesController],
  providers: [PharmaciesService, GooglePlacesProvider],
})
export class PharmaciesModule {}
