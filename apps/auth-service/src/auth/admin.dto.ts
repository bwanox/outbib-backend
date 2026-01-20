import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export class SetRoleRequestDto {
  @ApiProperty({ enum: ['user', 'admin'] })
  @IsString()
  @IsIn(['user', 'admin'])
  role!: 'user' | 'admin';
}

export class DisableUserRequestDto {
  @ApiProperty({ enum: ['disabled'], default: 'disabled' })
  @IsString()
  @IsIn(['disabled'])
  status!: 'disabled';
}
