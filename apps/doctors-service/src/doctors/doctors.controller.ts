import { Controller, Get, Post, Body, Patch, Param, Query } from '@nestjs/common';
import { DoctorsService } from './doctors.service';
import { MapsService } from './maps.service'; // <--- Import
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';

@Controller('doctors')
export class DoctorsController {
  constructor(
    private readonly doctorsService: DoctorsService,
    private readonly mapsService: MapsService, // <--- Inject
  ) {}

  // --- NEW: Import Endpoint ---
  @Post('import')
  async importFromMaps(@Query('query') query: string) {
    // 1. Fetch from Maps
    const doctorsFromMaps = await this.mapsService.searchDoctors(query);
    
    // 2. Save to DB (Skipping duplicates)
    const results = { imported: 0, skipped: 0 };
    
    for (const doc of doctorsFromMaps) {
      try {
        await this.doctorsService.create(doc);
        results.imported++;
      } catch (e) {
        results.skipped++;
      }
    }
    return { message: 'Import complete', ...results };
  }

  // ... keep all your existing methods (create, findAll, findOne, update, claim)
  @Post()
  create(@Body() createDoctorDto: CreateDoctorDto) {
    return this.doctorsService.create(createDoctorDto);
  }

  @Get()
  findAll(@Query('city') city?: string, @Query('specialty') specialty?: string) {
    return this.doctorsService.findAll(city, specialty);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.doctorsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDoctorDto: UpdateDoctorDto) {
    return this.doctorsService.update(id, updateDoctorDto);
  }

  @Patch(':id/claim')
  claim(@Param('id') id: string, @Body('ownerId') ownerId: string) {
    return this.doctorsService.claim(id, ownerId);
  }
}