import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class SnoozeOccurrenceDto {
  @ApiProperty({ description: 'ISO datetime' })
  @IsDateString()
  snoozedUntil!: string;
}
