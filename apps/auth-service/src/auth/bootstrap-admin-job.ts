import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

function isTrue(v: string | undefined, defaultValue = false) {
  if (v === undefined) return defaultValue;
  return v.toLowerCase() === 'true';
}

async function main() {
  const enabled = isTrue(process.env.AUTH_ADMIN_BOOTSTRAP_ENABLED, true);
  if (!enabled) {
    console.log('Admin bootstrap disabled');
    return;
  }

  const email = process.env.AUTH_ADMIN_EMAIL;
  const password = process.env.AUTH_ADMIN_PASSWORD;
  const allowPromoteExisting = isTrue(process.env.AUTH_ADMIN_PROMOTE_EXISTING, false);

  if (!email || !password) {
    console.error('Admin bootstrap skipped (AUTH_ADMIN_EMAIL/AUTH_ADMIN_PASSWORD not set)');
    process.exitCode = 0;
    return;
  }

  const normalized = email.toLowerCase().trim();
  const isEmail = /^\S+@\S+\.\S+$/.test(normalized);
  if (!isEmail) {
    console.error('Admin bootstrap blocked: AUTH_ADMIN_EMAIL is not a valid email');
    process.exitCode = 1;
    return;
  }

  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  if (password.length < 12 || !hasUpper || !hasLower || !hasNumber || !hasSymbol) {
    console.error('Admin bootstrap blocked: AUTH_ADMIN_PASSWORD must be >= 12 chars and include upper/lower/number/symbol');
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();

  try {
    const existing = await (prisma as any)['user'].findUnique({ where: { email: normalized } });
    if (existing) {
      if (existing.role !== 'admin' && allowPromoteExisting) {
        await (prisma as any)['user'].update({ where: { id: existing.id }, data: { role: 'admin' } });
        console.log('Admin bootstrap: existing user promoted to admin');
      } else {
        console.log('Admin bootstrap: user exists, no changes');
      }
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await (prisma as any)['user'].create({
      data: {
        email: normalized,
        passwordHash,
        passwordUpdatedAt: new Date(),
        role: 'admin',
        status: 'active',
      },
    });

    console.log('Admin bootstrap: admin user created');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Admin bootstrap failed');
  console.error(err);
  process.exitCode = 1;
});
