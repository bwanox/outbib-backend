import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AppController } from './app.controller';
import { AiService } from './ai.service';
import { MemoryService } from './memory/memory.service';
import { OptionalJwtAuthGuard } from './auth/optional-jwt-auth.guard';

@Module({
  imports: [
    // This loads the .env file and makes it available everywhere
    ConfigModule.forRoot({
      isGlobal: true, 
    }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret',
    }),
  ],
  controllers: [AppController],
  providers: [AiService, MemoryService, OptionalJwtAuthGuard],
})
export class AppModule {}
