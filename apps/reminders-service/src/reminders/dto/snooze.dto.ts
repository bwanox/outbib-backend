import { IsDateString } from 'class-validator';

export class SnoozeDto {
  @IsDateString()
  snoozedUntil!: string;
}
