import {MessageBody,SubscribeMessage,WebSocketGateway,WebSocketServer} from '@nestjs/websockets';
import {CreateEmerDto} from "../dto/create-emer.dto"
import {Socket,Server} from 'socket.io';
import {Injectable} from '@nestjs/common';
@Injectable()
@WebSocketGateway(3001,{})
export class WebSocketGw{
    @WebSocketServer() 
    server:Server;
    handleEvent(userId:string,dto:CreateEmerDto){
        this.server.emit("Emergency",`Patient:${userId}\nUrgence de type:${dto.type}`);
}
}