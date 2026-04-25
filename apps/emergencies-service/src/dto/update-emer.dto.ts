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
  IsNumber,
} from 'class-validator';

import { EmergencyStatusDto,Type } from './create-emer.dto';

export class UpdateEmerDto {

  @IsEnum(EmergencyStatusDto)
  status!: EmergencyStatusDto;

  @IsString()
  @IsNotEmpty()
  title!:string;

  @IsString()
  @IsOptional()
  message?:string;

  @IsEnum(Type)
  type!:Type;

  @IsNumber()
  @IsNotEmpty()
  latitude!: number;

  @IsNumber()
  @IsNotEmpty()
  longitude!: number;

  @IsDateString()
  @IsNotEmpty()
  triggeredAt!: string;

  @IsDateString()
  @IsNotEmpty()
  resolvedAt!: string;
  
  @IsDateString()
  @IsNotEmpty()
  createdAt!: string;

  @IsDateString()
  @IsNotEmpty()
  updatedAt!: string;
}
