import { Body, Controller, Get, Param, Patch, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  AuthTokensDto,
  LoginRequestDto,
  LogoutRequestDto,
  MeResponseDto,
  RefreshRequestDto,
  RegisterRequestDto,
} from '@outbib/contracts';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Roles } from './roles.decorator';
import { RolesGuard } from './guards/roles.guard';
import { SetRoleRequestDto, DisableUserRequestDto } from './admin.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOkResponse({ type: MeResponseDto })
  async register(@Body() dto: RegisterRequestDto): Promise<MeResponseDto> {
    const user = await this.authService.register(dto.email, dto.password);
    return {
      id: user.id,
      email: user.email,
      role: user.role as any,
      status: user.status as any,
    };
  }

  @Post('login')
  @ApiOkResponse({ type: AuthTokensDto })
  async login(@Body() dto: LoginRequestDto): Promise<AuthTokensDto> {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('refresh')
  @ApiOkResponse({ type: AuthTokensDto })
  async refresh(@Body() dto: RefreshRequestDto): Promise<AuthTokensDto> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @ApiOkResponse({ schema: { example: { status: 'ok' } } })
  async logout(@Body() dto: LogoutRequestDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ type: MeResponseDto })
  async me(@Req() req: any): Promise<MeResponseDto> {
    const userId = req.user?.sub as string;
    return this.authService.me(userId);
  }

  @Patch('admin/users/:id/role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOkResponse({ type: MeResponseDto })
  async adminSetRole(@Param('id') id: string, @Body() dto: SetRoleRequestDto): Promise<MeResponseDto> {
    const user = await this.authService.setRole(id, dto.role);
    return { id: user.id, email: user.email, role: user.role as any, status: user.status as any };
  }

  @Patch('admin/users/:id/disable')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOkResponse({ type: MeResponseDto })
  async adminDisable(@Param('id') id: string, @Body() dto: DisableUserRequestDto): Promise<MeResponseDto> {
    const user = await this.authService.disableUser(id);
    return { id: user.id, email: user.email, role: user.role as any, status: user.status as any };
  }
}
