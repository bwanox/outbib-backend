import Bull from "bull"
import dotenv from "dotenv"
import { Injectable } from '@nestjs/common'
@Injectable()
export class RedisService {
    async Connection(){
        dotenv.config()
        const { REDIS_HOST,REDIS_PORT,REDIS_PASSWORD,DATABASE_URL } = process.env;
        const redisOptions={
            redis:{host : REDIS_HOST,port:REDIS_PORT,password:REDIS_PASSWORD}
        };
    }

}
