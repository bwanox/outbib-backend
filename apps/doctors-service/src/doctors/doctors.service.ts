import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';
import { DoctorStatus } from '@prisma/client';

@Injectable()
export class DoctorsService {
  constructor(private prisma: PrismaService) {}

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

    return this.prisma.doctor.findMany({
      where,
      orderBy: { isFeatured: 'desc' },
    });
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
}