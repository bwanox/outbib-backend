import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertProfile(userId: string, email: string, data: { firstName?: string; lastName?: string }) {
    return this.prisma.userProfile.upsert({
      where: { id: userId },
      create: { id: userId, email, ...data },
      update: { ...data },
    });
  }

  async getProfile(userId: string) {
    return this.prisma.userProfile.findUnique({ where: { id: userId } });
  }
}
