import {Module} from '@nestjs/common'
import {WebSocketGw} from './websocket.service'
@Module({
    providers:[WebSocketGw],
})
export class WebSocketModule{}