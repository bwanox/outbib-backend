import {Module} from "@nestjs/common"
import {EmergencyService} from "./emer.service"
import {EmergencyController} from "./emer.controller"
import {WebSocketGw} from "../websocket/websocket.service"
import {PrismaService} from "../../prisma/prisma.service" 
import {WebSocketModule} from "../websocket/websocket.module"
@Module(
    {
        imports:[WebSocketModule],
        providers:[EmergencyService,WebSocketGw,PrismaService],
        controllers:[EmergencyController]
    }
)
export class EmergencyModule{}