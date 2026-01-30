import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  private readonly secret = process.env.JWT_SECRET || 'dev-secret';

  constructor(private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];

    if (!header) return true;
    if (!header.startsWith('Bearer ')) {
      return true;
    }

    const token = header.slice('Bearer '.length);
    try {
      const payload = await this.jwt.verifyAsync(token, { secret: this.secret });
      req.user = payload;
      return true;
    } catch {
      // Allow anonymous access if token is invalid/expired; memory will be skipped.
      return true;
    }
  }
}
