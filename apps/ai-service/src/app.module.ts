import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AiService } from './ai.service';

@Module({
  imports: [
    // This loads the .env file and makes it available everywhere
    ConfigModule.forRoot({
      isGlobal: true, 
    }),
  ],
  controllers: [AppController],
  providers: [AiService],
})
export class AppModule {}