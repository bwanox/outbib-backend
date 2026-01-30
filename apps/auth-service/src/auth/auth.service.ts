import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthEventsPublisher } from '../events/auth-events.publisher';

const REFRESH_SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly events: AuthEventsPublisher,
  ) {}

  async register(email: string, password: string) {
    const normalized = email.toLowerCase();
    // NOTE: In this monorepo, Prisma Client types can be overwritten by another service's schema generation.
    // We intentionally use a loosely-typed delegate accessor here to keep builds unblocked.
    // TODO: isolate Prisma clients per service (separate generated outputs) and remove these casts.
    const existing = await (this.prisma as any)['user'].findUnique({ where: { email: normalized } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await (this.prisma as any)['user'].create({
      data: {
        email: normalized,
        passwordHash,
        passwordUpdatedAt: new Date(),
      },
    });

    await this.events.publishUserRegistered({ userId: user.id, email: user.email });
    return user;
  }

  async login(email: string, password: string) {
    // NOTE: In this monorepo, Prisma Client types can be overwritten by another service's schema generation.
    // We intentionally use a loosely-typed delegate accessor here to keep builds unblocked.
    // TODO: isolate Prisma clients per service (separate generated outputs) and remove these casts.
    const user = await (this.prisma as any)['user'].findUnique({ where: { email: email.toLowerCase() } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.status === 'disabled') throw new UnauthorizedException('Account disabled');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const { accessToken, refreshToken } = await this.issueTokens(user.id, user.email, user.role);
    const refreshTokenHash = await bcrypt.hash(refreshToken, REFRESH_SALT_ROUNDS);

    await (this.prisma as any)['user'].update({
      where: { id: user.id },
      data: { refreshTokenHash },
    });

    return { accessToken, refreshToken };
  }

  async refresh(refreshToken: string) {
    const payload = await this.jwt.verifyAsync(refreshToken, {
      secret: process.env.JWT_REFRESH_SECRET || (process.env.JWT_SECRET || 'dev-secret'),
    });

    const userId = payload.sub as string;
    // NOTE: In this monorepo, Prisma Client types can be overwritten by another service's schema generation.
    // We intentionally use a loosely-typed delegate accessor here to keep builds unblocked.
    // TODO: isolate Prisma clients per service (separate generated outputs) and remove these casts.
    const user = await (this.prisma as any)['user'].findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Invalid refresh token');
    if (user.status === 'disabled') throw new UnauthorizedException('Account disabled');
    if (!user.refreshTokenHash) throw new UnauthorizedException('Logged out');

    const ok = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!ok) throw new UnauthorizedException('Invalid refresh token');

    // Rotate refresh token
    const tokens = await this.issueTokens(user.id, user.email, user.role);
    const newHash = await bcrypt.hash(tokens.refreshToken, REFRESH_SALT_ROUNDS);
    await (this.prisma as any)['user'].update({ where: { id: user.id }, data: { refreshTokenHash: newHash } });

    return tokens;
  }

  async logout(refreshToken: string) {
    // Best-effort: if token invalid, treat as already logged out.
    try {
      const payload = await this.jwt.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || (process.env.JWT_SECRET || 'dev-secret'),
      });
      const userId = payload.sub as string;
      // NOTE: In this monorepo, Prisma Client types can be overwritten by another service's schema generation.
      // We intentionally use a loosely-typed delegate accessor here to keep builds unblocked.
      // TODO: isolate Prisma clients per service (separate generated outputs) and remove these casts.
      await (this.prisma as any)['user'].update({ where: { id: userId }, data: { refreshTokenHash: null } });
    } catch {
      // ignore
    }

    return { status: 'ok' as const };
  }

  async me(userId: string) {
    // NOTE: In this monorepo, Prisma Client types can be overwritten by another service's schema generation.
    // We intentionally use a loosely-typed delegate accessor here to keep builds unblocked.
    // TODO: isolate Prisma clients per service (separate generated outputs) and remove these casts.
    const user = await (this.prisma as any)['user'].findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Invalid user');
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
    };
  }

  async setRole(userId: string, role: 'user' | 'admin') {
    // NOTE: In this monorepo, Prisma Client types can be overwritten by another service's schema generation.
    // We intentionally use a loosely-typed delegate accessor here to keep builds unblocked.
    // TODO: isolate Prisma clients per service (separate generated outputs) and remove these casts.
    const user = await (this.prisma as any)['user'].update({
      where: { id: userId },
      data: { role },
    });

    await this.events.publishUserRoleUpdated({ userId: user.id, role });
    return user;
  }

  async disableUser(userId: string) {
    // NOTE: In this monorepo, Prisma Client types can be overwritten by another service's schema generation.
    // We intentionally use a loosely-typed delegate accessor here to keep builds unblocked.
    // TODO: isolate Prisma clients per service (separate generated outputs) and remove these casts.
    const user = await (this.prisma as any)['user'].update({
      where: { id: userId },
      data: { status: 'disabled' },
    });

    await this.events.publishUserDisabled({ userId: user.id, status: 'disabled' });
    return user;
  }

  private async issueTokens(userId: string, email: string, role: string) {
    const accessToken = await this.jwt.signAsync({ sub: userId, email, role });

    // Refresh tokens should ideally use a separate secret
    const refreshJwt = new JwtService({
      secret: process.env.JWT_REFRESH_SECRET || (process.env.JWT_SECRET || 'dev-secret'),
      signOptions: { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' },
    } as any);

    const refreshToken = await refreshJwt.signAsync({ sub: userId, email, role });

    return { accessToken, refreshToken };
  }
}
