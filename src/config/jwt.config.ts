import { registerAs } from '@nestjs/config';

function requireSecretInProduction(secret: string | undefined): string {
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production');
  }
  return secret || 'default_secret';
}

export const jwtConfig = registerAs('jwt', () => ({
  secret: requireSecretInProduction(process.env.JWT_SECRET),
  expiresIn: process.env.JWT_EXPIRES_IN || '7d',
}));
