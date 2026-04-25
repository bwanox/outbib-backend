import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import {WebSocketModule} from './websocket/websocket.module'
import {EmergencyModule} from "./emergency/emer.module"
import {PrismaService} from "../prisma/prisma.service"
import {WebSocketGw} from "./websocket/websocket.service"
import {EmergencyService} from "./emergency/emer.service"
import {EmergencyController} from "./emergency/emer.controller"

@Module({
  imports: [EmergencyModule],
  controllers: [AppController],
  providers: [AppService,EmergencyService,PrismaService,WebSocketGw],
})
export class AppModule {}
