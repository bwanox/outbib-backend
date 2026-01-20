import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UpdateMeRequestDto, UserMeResponseDto } from '@outbib/contracts';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ type: UserMeResponseDto })
  async me(@Req() req: any): Promise<UserMeResponseDto> {
    const userId = req.user?.sub as string;
    const profile = await this.usersService.getProfile(userId);
    return {
      id: userId,
      email: profile?.email ?? (req.user?.email as string),
      firstName: profile?.firstName,
      lastName: profile?.lastName,
    };
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ type: UserMeResponseDto })
  async updateMe(@Req() req: any, @Body() dto: UpdateMeRequestDto): Promise<UserMeResponseDto> {
    const userId = req.user?.sub as string;
    const email = req.user?.email as string;
    const profile = await this.usersService.upsertProfile(userId, email, dto);

    return {
      id: profile.id,
      email: profile.email,
      firstName: profile.firstName ?? undefined,
      lastName: profile.lastName ?? undefined,
    };
  }
}
