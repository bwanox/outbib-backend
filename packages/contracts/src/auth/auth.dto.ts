import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { UserRole, UserStatus } from './auth.types';

export class RegisterRequestDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, example: 'StrongPass123' })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class LoginRequestDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, example: 'StrongPass123' })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class AuthTokensDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;
}

export class RefreshRequestDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}

export class LogoutRequestDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}

export class MeResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiProperty({ enum: ['user', 'admin'] })
  role!: UserRole;

  @ApiProperty({ enum: ['active', 'disabled'] })
  status!: UserStatus;
}
