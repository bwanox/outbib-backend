import { IsString, IsOptional, IsArray, IsBoolean } from 'class-validator';

export class UpdateDoctorDto {
  // --- OUTBIB OWNED DATA (Editable) ---
  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialties?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  insurance?: string[];

  @IsOptional()
  fees?: any; // JSON object { "consultation": 300 }

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;
}