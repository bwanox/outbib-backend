import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class WaterGetQueryDto {
  @ApiProperty({ example: '2026-01-26' })
  @IsString()
  @IsNotEmpty()
  date!: string;
}
