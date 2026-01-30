import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class CalendarRangeQueryDto {
  @ApiPropertyOptional({ description: 'ISO datetime' })
  @IsDateString()
  from!: string;

  @ApiPropertyOptional({ description: 'ISO datetime' })
  @IsDateString()
  to!: string;
}
