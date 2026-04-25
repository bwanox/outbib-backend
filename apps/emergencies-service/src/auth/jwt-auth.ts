import { CanActivate, ExecutionContext, Injectable, UnauthorizedException,NestInterceptor } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
export class jwt_s implements CanActivate{
    private readonly jwt_sec=process.env.JWT_SECRET || 'dev-secret';
    constructor(private readonly jwtSer:JwtService){}
        async canActivate(ctx:ExecutionContext):Promise<boolean>{
        const check=ctx.switchToHttp().getRequest().header['Authorization'];
        if(!check){return false;}
        if(!check.startwith('Bearer ')){return false;}
        const token=check.slice('Bearer '.length);
        try{
        const allowed=await this.jwtSer.verifyAsync(token,{secret:this.jwt_sec});
        check.user=allowed;
        return true;    
        }
        catch(err){
            return false;
        }
        
    }
}