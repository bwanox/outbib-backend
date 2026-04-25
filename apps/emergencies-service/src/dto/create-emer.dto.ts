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

export enum EmergencyStatusDto {
   ACTIVE = 'ACTIVE',
   RESOLVED= 'RESOLVED',
   CANCELLED = 'CANCELLED'
}
export enum Type {
  CARDIOLOGY   = 'CARDIOLOGY',
  NEUROLOGY    = 'NEUROLOGY',
  TRAUMA       = 'TRAUMA',
  ORTHOPEDIC   = 'ORTHOPEDIC',
  RESPIRATORY  = 'RESPIRATORY',
  PEDIATRIC    = 'PEDIATRIC',
  OBSTETRIC    = 'OBSTETRIC',
  TOXICOLOGY   = 'TOXICOLOGY',
  BURNS        = 'BURNS',
  GENERAL      = 'GENERAL',
}
export class CreateEmerDto {

  @IsEnum(EmergencyStatusDto)
  status!: EmergencyStatusDto;

  @IsEnum(Type)
  type!:Type;

  @IsString()
  @IsNotEmpty()
  title!:string;

  @IsString()
  @IsOptional()
  message?:string;

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
