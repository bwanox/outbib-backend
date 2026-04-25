import { Body,Controller, Get,Post } from "@nestjs/common";
import { AppService } from "./app.service";
import {CreateEmerDto,Type,EmergencyStatusDto} from "./dto/create-emer.dto"
import {EmergencyController} from "./emergency/emer.controller"
import {EmergencyService} from "./emergency/emer.service"

@Controller()
export class AppController {
  /*constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get("health")
  health() {
    return { status: "ok" };
  }*/
 constructor(private readonly Ec:EmergencyService){}
  @Post('Emergency')
  async AddEmerg(@Body() dto:CreateEmerDto){
    /*const dto=new CreateEmerDto();
    dto.status=EmergencyStatusDto.ACTIVE;
    dto.type=Type.GENERAL;
    dto.title="crise cardiaque";
    dto.message="aksjdfhasfhajksfhjahfsjkafh";
    dto.latitude=19.2
    dto.longitude=19.2*/
    const userId="1";
    await this.Ec.NotifyDoctor(userId,dto);
    return {created:"True"};
  }
}
