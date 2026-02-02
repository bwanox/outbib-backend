import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PharmaciesModule } from './pharmacies/pharmacies.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PharmaciesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
