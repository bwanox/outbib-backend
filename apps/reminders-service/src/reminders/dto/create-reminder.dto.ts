import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateIf,
} from 'class-validator';

export enum ReminderTypeDto {
  MEDICATION = 'MEDICATION',
  APPOINTMENT = 'APPOINTMENT',
  WATER_HABIT = 'WATER_HABIT',
  NOTE = 'NOTE',
}

export class CreateReminderDto {
  @IsEnum(ReminderTypeDto)
  type!: ReminderTypeDto;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @Length(1, 64)
  timezone!: string;

  // Medication
  @ValidateIf((o) => o.type === ReminderTypeDto.MEDICATION)
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  dosageText?: string;

  @ValidateIf((o) => o.type === ReminderTypeDto.MEDICATION)
  @IsArray()
  @IsString({ each: true })
  timesOfDay!: string[]; // ['08:00','20:30']

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
  appointmentAt!: string;

  @ValidateIf((o) => o.type === ReminderTypeDto.APPOINTMENT)
  @IsString()
  @IsOptional()
  location?: string;

  // Water habit
  @ValidateIf((o) => o.type === ReminderTypeDto.WATER_HABIT)
  @IsInt()
  @Min(0)
  dailyGoalMl!: number;

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
  activeHours?: string; // '08:00-22:00'

  // Note/task
  @ValidateIf((o) => o.type === ReminderTypeDto.NOTE)
  @IsDateString()
  @IsOptional()
  scheduledAt?: string;
}
