import { IsString, IsNotEmpty, IsNumber, IsOptional, IsJSON, IsArray } from 'class-validator';

export class CreateDoctorDto {
  // --- MAPS DATA (Required for creation) ---
  @IsString()
  @IsNotEmpty()
  googlePlaceId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;

  // --- OPTIONAL MAPS DATA ---
  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  mapsUrl?: string;

  @IsOptional()
  openingHours?: any; // JSON
}