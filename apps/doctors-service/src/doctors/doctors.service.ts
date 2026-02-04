import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';
import { DoctorStatus } from '@prisma/client';
import { MapsService } from './maps.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DoctorsService {
  private readonly logger = new Logger(DoctorsService.name);

  constructor(
    private prisma: PrismaService,
    private mapsService: MapsService,
    private configService: ConfigService,
  ) {}

  // 1. IMPORT (Admin Only)
  async create(createDoctorDto: CreateDoctorDto) {
    const existing = await this.prisma.doctor.findUnique({
      where: { googlePlaceId: createDoctorDto.googlePlaceId },
    });

    if (existing) throw new ConflictException('Doctor already imported');

    return this.prisma.doctor.create({
      data: {
        ...createDoctorDto,
        status: DoctorStatus.UNCLAIMED,
      },
    });
  }

  // 2. SEARCH (Public)
  async findAll(city?: string, specialty?: string) {
    // TODO: Add Redis caching here
    const where: any = {};
    if (city) where.city = { contains: city, mode: 'insensitive' };
    if (specialty) where.specialties = { has: specialty };

    const items = await this.prisma.doctor.findMany({
      where,
      orderBy: { isFeatured: 'desc' },
    });

    const autoSyncEnabled = this.getBoolEnv('DOCTORS_AUTO_IMPORT_ON_MISS', true);
    const canAutoImport = autoSyncEnabled && items.length === 0 && city;

    if (canAutoImport) {
      try {
        const query = specialty ? `${specialty} in ${city}` : `doctor in ${city}`;
        const doctorsFromMaps = await this.mapsService.searchDoctors(query);
        for (const doc of doctorsFromMaps) {
          try {
            await this.create(doc as CreateDoctorDto);
          } catch {
            // skip duplicates / conflicts
          }
        }

        return this.prisma.doctor.findMany({
          where,
          orderBy: { isFeatured: 'desc' },
        });
      } catch (err: any) {
        this.logger.warn(`Auto-import failed for city ${city}: ${err?.message ?? err}`);
      }
    }

    return items;
  }

  // 3. GET ONE (Public)
  async findOne(id: string) {
    const doctor = await this.prisma.doctor.findUnique({ where: { id } });
    if (!doctor) throw new NotFoundException('Doctor not found');
    return doctor;
  }

  // 4. UPDATE (Verified Doctor Only)
  async update(id: string, updateDoctorDto: UpdateDoctorDto) {
    await this.findOne(id); // Ensure existence
    return this.prisma.doctor.update({
      where: { id },
      data: updateDoctorDto, // Can ONLY update bio, fees, etc.
    });
  }

  // 5. CLAIM (Doctor)
  async claim(id: string, ownerId: string) {
    return this.prisma.doctor.update({
      where: { id },
      data: { status: DoctorStatus.PENDING, ownerId },
    });
  }

  private getBoolEnv(name: string, fallback: boolean) {
    const raw = this.configService.get<string>(name);
    if (raw == null || raw.trim() === '') return fallback;
    return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
  }
}
