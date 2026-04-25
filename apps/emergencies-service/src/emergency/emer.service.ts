import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis_service/redis-service';
import { CreateEmerDto, EmergencyStatusDto,Type } from '../dto/create-emer.dto';
import { UpdateEmerDto } from '../dto/update-emer.dto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {WebSocketGw} from "../websocket/websocket.service"
@Injectable()
export class EmergencyService {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly WebSocketService:WebSocketGw
    ){}

    async CreateEmer(userId: string, dto: CreateEmerDto){
        try{
            const emer=await this.prismaService.emergency.create({
            data:{
                userId:userId,
                status: EmergencyStatusDto.ACTIVE,
                type:dto.type,
                title: dto.title,
                message: dto.message,
                latitude: dto.latitude,
                longitude: dto.longitude,
                triggeredAt: dto.triggeredAt ? new Date(dto.triggeredAt) : undefined,
                resolvedAt: dto.resolvedAt ? new Date(dto.resolvedAt) : null,
            }
        });
        return emer;
        }
        catch(err){
            console.log(err)
        }
    }
    async updateEmer(id:string, dto: UpdateEmerDto){{
        const emer=await this.prismaService.emergency.findUnique({
            where:{id}
            })
        if(!emer){
            throw new NotFoundException('Emergency not found'); 
        }

        if(dto.status==EmergencyStatusDto.CANCELLED){
            const message=await this.RemoveEmergency(id);
            return {message:"Emergency was Deleted"}
        }

        if(dto.status==EmergencyStatusDto.RESOLVED){
            const resolved=await this.prismaService.emergency.update({
                where:{id},
                data:{
                    status:EmergencyStatusDto.RESOLVED,
                    resolvedAt:dto.createdAt? new Date(dto.createdAt):null
                }
            })
            return resolved;
        }
        const updatedEmer=await this.prismaService.emergency.update({
            where:{id},
            data:{
                title: dto.title ?? emer.title,
                message: dto.message ?? emer.message,
                type:dto.type,
                latitude: dto.latitude ?? emer.latitude,
                longitude: dto.longitude ?? emer.longitude,
                triggeredAt: dto.triggeredAt ? new Date(dto.triggeredAt) : undefined,
            }
        })
        return updatedEmer;
    }}

    async RemoveEmergency(id:string){
        await this.prismaService.emergency.delete({
            where:{id}
        });
        return {message:'Emergency Cancelled successfully'};
    }
    async RemoveResolvedEmergencies(){
        const Emer_Info=await this.prismaService.emergency.findMany(
            {
                where:{status:EmergencyStatusDto.RESOLVED}
            }
        )
        if(!Emer_Info){
            throw new NotFoundException('No Emergency Left'); 
        }
        for(const emer of Emer_Info){
        if((new Date().valueOf()-new Date(emer.createdAt).valueOf())>2629800000){
            const rm=await this.RemoveEmergency(emer.id);
        }
        }
        return {message:"All Emergencies Resolved one Month ago were deleted"}

    }
    async ActiveEmergencies(){
        const emers=await this.prismaService.emergency.findMany(
            {
                where:{status:EmergencyStatusDto.ACTIVE},
            }
        );
        return emers;
    }
    async ListEmergencies(){
        const emers=await this.prismaService.emergency.findMany();
        if(!emers){
            throw new NotFoundException('No Emergency Left'); 
        }
        return emers;
    }
    async NotifyDoctor(userId:string,dto:CreateEmerDto){
        try{
        if(!dto.type){
            throw new NotFoundException("Type of Emergency unknown");
        }
            const emer=await this.CreateEmer(userId,dto);
            if(!emer){throw new NotFoundException('Can not create'); }
            if(emer.status==EmergencyStatusDto.ACTIVE){
                this.WebSocketService.handleEvent(userId,dto);
            }
        }
        catch(err){
            return {message:"Error occured"}
        }

    }
}
