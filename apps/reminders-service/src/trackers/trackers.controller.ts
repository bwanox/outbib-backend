import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TrackersService } from './trackers.service';
import { WaterLogRequestDto } from './dto/water-log.dto';
import { WaterGetQueryDto } from './dto/water-get-query.dto';

@ApiTags('trackers')
@Controller('trackers')
export class TrackersController {
  constructor(private readonly trackersService: TrackersService) {}

  @Post('water/log')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Append water entry and return updated daily log' })
  async logWater(@Req() req: any, @Body() dto: WaterLogRequestDto) {
    const userId = req.user?.sub as string;
    return this.trackersService.logWater(userId, dto.amountMl, dto.at, dto.date);
  }

  @Get('water')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getWater(@Req() req: any, @Query() q: WaterGetQueryDto) {
    const userId = req.user?.sub as string;
    return this.trackersService.getWater(userId, q.date);
  }
}
