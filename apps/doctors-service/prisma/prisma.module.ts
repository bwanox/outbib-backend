import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global() // Global so we don't have to import it everywhere
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
