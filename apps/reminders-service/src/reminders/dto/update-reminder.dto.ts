import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateIf,
} from 'class-validator';
import { ReminderTypeDto } from './create-reminder.dto';

export class UpdateReminderDto {
  @IsEnum(ReminderTypeDto)
  @IsOptional()
  type?: ReminderTypeDto;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @Length(1, 64)
  @IsOptional()
  timezone?: string;

  // Medication
  @ValidateIf((o) => o.type === ReminderTypeDto.MEDICATION)
  @IsString()
  @IsOptional()
  dosageText?: string;

  @ValidateIf((o) => o.type === ReminderTypeDto.MEDICATION)
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  timesOfDay?: string[];

  @ValidateIf((o) => o.type === ReminderTypeDto.MEDICATION)
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ValidateIf((o) => o.type === ReminderTypeDto.MEDICATION)
  @IsDateString()
  @IsOptional()
  endDate?: string;

  // Appointment
  @ValidateIf((o) => o.type === ReminderTypeDto.APPOINTMENT)
  @IsDateString()
  @IsOptional()
  appointmentAt?: string;

  @ValidateIf((o) => o.type === ReminderTypeDto.APPOINTMENT)
  @IsString()
  @IsOptional()
  location?: string;

  // Water habit
  @ValidateIf((o) => o.type === ReminderTypeDto.WATER_HABIT)
  @IsInt()
  @Min(0)
  @IsOptional()
  dailyGoalMl?: number;

  @ValidateIf((o) => o.type === ReminderTypeDto.WATER_HABIT)
  @IsBoolean()
  @IsOptional()
  nudgeEnabled?: boolean;

  @ValidateIf((o) => o.type === ReminderTypeDto.WATER_HABIT)
  @IsInt()
  @Min(1)
  @IsOptional()
  nudgeEveryMinutes?: number;

  @ValidateIf((o) => o.type === ReminderTypeDto.WATER_HABIT)
  @IsString()
  @IsOptional()
  activeHours?: string;

  // Note/task
  @ValidateIf((o) => o.type === ReminderTypeDto.NOTE)
  @IsDateString()
  @IsOptional()
  scheduledAt?: string;
}
