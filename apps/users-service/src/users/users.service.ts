import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertProfile(
    userId: string,
    email: string,
    data: {
      firstName?: string;
      lastName?: string;
      role?: string;
      status?: string;
    },
  ) {
    return (this.prisma as any)['userProfile'].upsert({
      where: { id: userId },
      create: { id: userId, email, ...data },
      update: { ...data },
    });
  }

  async setAccountMetadata(userId: string, data: { role?: string; status?: string }) {
    return (this.prisma as any)['userProfile'].upsert({
      where: { id: userId },
      create: {
        id: userId,
        email: `unknown+${userId}@local`,
        role: data.role ?? 'user',
        status: data.status ?? 'active',
      },
      update: { ...data },
    });
  }

  async getProfile(userId: string) {
    return (this.prisma as any)['userProfile'].findUnique({ where: { id: userId } });
  }
}
