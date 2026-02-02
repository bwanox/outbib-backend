import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PharmaciesService } from './pharmacies.service';
import { GetPharmaciesQueryDto } from './dto/get-pharmacies.query';
import { GetNearbyQueryDto } from './dto/get-nearby.query';
import { SyncPharmaciesDto } from './dto/sync-pharmacies.dto';

@ApiTags('pharmacies')
@Controller('pharmacies')
export class PharmaciesController {
  constructor(private readonly pharmaciesService: PharmaciesService) {}

  @Get()
  @ApiOperation({ summary: 'List pharmacies by city' })
  @ApiOkResponse({ description: 'Paginated list of pharmacies' })
  list(@Query() query: GetPharmaciesQueryDto) {
    return this.pharmaciesService.list(query);
  }

  @Get('nearby')
  @ApiOperation({ summary: 'Find nearby pharmacies' })
  @ApiOkResponse({ description: 'Nearby pharmacy list' })
  nearby(@Query() query: GetNearbyQueryDto) {
    return this.pharmaciesService.nearby(query);
  }

  @Get('by-place/:placeId')
  @ApiOperation({ summary: 'Get pharmacy by Google placeId' })
  @ApiOkResponse({ description: 'Pharmacy details' })
  getByPlace(@Param('placeId') placeId: string) {
    return this.pharmaciesService.getByPlaceId(placeId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get pharmacy by id' })
  @ApiOkResponse({ description: 'Pharmacy details' })
  getById(@Param('id') id: string) {
    return this.pharmaciesService.getById(id);
  }

  @Post('sync')
  @ApiOperation({ summary: 'Sync pharmacies from Google Places' })
  @ApiOkResponse({ description: 'Sync job summary' })
  sync(@Body() dto: SyncPharmaciesDto) {
    return this.pharmaciesService.sync(dto);
  }

  @Get('sync/status')
  @ApiOperation({ summary: 'Get sync status for a city' })
  @ApiQuery({ name: 'city', required: true })
  @ApiOkResponse({ description: 'Latest sync job' })
  syncStatus(@Query('city') city: string) {
    return this.pharmaciesService.syncStatus(city);
  }
}
