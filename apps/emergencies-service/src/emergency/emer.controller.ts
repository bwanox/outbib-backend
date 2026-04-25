import {EmergencyService} from "./emer.service"
import {Controller} from "@nestjs/common"
import {WebSocketGw} from "../websocket/websocket.service"
import {CreateEmerDto} from "../dto/create-emer.dto"

@Controller()
export class EmergencyController{
    constructor(private readonly EmerServ:EmergencyService,private readonly WebServ:WebSocketGw){}
    async NotifyDoctors(userId:string,dto:CreateEmerDto){
        await this.EmerServ.NotifyDoctor(userId,dto)
    }
}