import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';

export class WaterLogRequestDto {
  @ApiProperty({ description: 'Amount to add (ml)', example: 250 })
  @IsInt()
  @Min(1)
  amountMl!: number;

  @ApiPropertyOptional({ description: 'ISO datetime of entry (defaults to now)' })
  @IsDateString()
  @IsOptional()
  at?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD (defaults to today in UTC)' })
  @IsOptional()
  date?: string;
}
