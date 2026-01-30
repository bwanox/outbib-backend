import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CalendarDayQueryDto {
  @ApiProperty({ example: '2026-01-26' })
  @IsString()
  @IsNotEmpty()
  date!: string; // YYYY-MM-DD

  @ApiProperty({ example: 'Europe/Paris' })
  @IsString()
  @IsNotEmpty()
  tz!: string;
}
