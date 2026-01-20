import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  ValidateIf,
} from 'class-validator';

export enum ReminderTypeDto {
  MEDICATION = 'MEDICATION',
  APPOINTMENT = 'APPOINTMENT',
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
  dosageText!: string;

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
}
