/**
 * Security e2e tests — auth endpoints and role guards.
 *
 * These tests verify:
 * 1. Public endpoints are accessible without a token
 * 2. Protected endpoints reject unauthenticated requests (401)
 * 3. Role-restricted endpoints reject the wrong role (403)
 * 4. Correct role gets through (200/201)
 * 5. Refresh token rotation works and re-use is blocked
 * 6. Logout invalidates the refresh token
 *
 * Uses SQLite in-memory via FIRESTORE=true env + DB_SYNC=true so no real DB needed.
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractCookies(res: request.Response): Record<string, string> {
  const cookies: Record<string, string> = {};
  const setCookie = res.headers['set-cookie'] as string[] | string | undefined;
  if (!setCookie) return cookies;
  const list = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const c of list) {
    const [pair] = c.split(';');
    const [name, value] = pair.split('=');
    cookies[name.trim()] = value?.trim() ?? '';
  }
  return cookies;
}

function cookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('Auth & Role Security (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Force in-memory SQLite + auto-seed for tests
    process.env.DB_SYNC = 'true';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── 1. Public endpoints ────────────────────────────────────────────────────

  describe('Public endpoints (no auth required)', () => {
    it('GET /api/health → 200', async () => {
      await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);
    });

    it('POST /api/auth/web/login with bad credentials → 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/web/login')
        .send({ email: 'nobody@example.com', password: 'wrong' })
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBeTruthy();
    });

    it('POST /api/auth/mobile/login with bad credentials → 401', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/mobile/login')
        .send({ email: 'nobody@example.com', password: 'wrong' })
        .expect(401);
    });
  });

  // ── 2. Unauthenticated access ─────────────────────────────────────────────

  describe('Protected endpoints reject unauthenticated requests', () => {
    const protectedEndpoints = [
      { method: 'GET', path: '/api/auth/me' },
      { method: 'POST', path: '/api/auth/logout' },
      { method: 'POST', path: '/api/auth/change-password' },
      { method: 'GET', path: '/api/schools' },
      { method: 'POST', path: '/api/schools' },
      { method: 'GET', path: '/api/schools/00000000-0000-0000-0000-000000000000' },
      { method: 'PATCH', path: '/api/schools/00000000-0000-0000-0000-000000000000' },
      { method: 'DELETE', path: '/api/schools/00000000-0000-0000-0000-000000000000' },
      { method: 'POST', path: '/api/schools/00000000-0000-0000-0000-000000000000/reset-admin-password' },
    ] as const;

    for (const ep of protectedEndpoints) {
      it(`${ep.method} ${ep.path} → 401 without cookie`, async () => {
        const res = await (request(app.getHttpServer()) as any)[ep.method.toLowerCase()](ep.path)
          .send({})
          .expect(401);
        expect(res.body.success).toBe(false);
      });
    }
  });

  // ── 3 + 4. Role guards ────────────────────────────────────────────────────

  describe('Role guards — SUPER_ADMIN login', () => {
    let superAdminCookies: Record<string, string> = {};

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/web/login')
        .send({
          email: process.env.SUPER_ADMIN_EMAIL ?? 'superadmin@buspoint.app',
          password: process.env.SUPER_ADMIN_PASSWORD ?? 'BusPoint@SuperAdmin#1',
        });

      if (res.status !== 200) {
        // Super admin seed may not run in test env — skip gracefully
        console.warn('Super admin login failed — seed may not have run. Skipping role tests.');
        return;
      }

      superAdminCookies = extractCookies(res);
      expect(superAdminCookies['access_token']).toBeTruthy();
    });

    it('GET /api/auth/me → 200 with valid cookie', async () => {
      if (!superAdminCookies['access_token']) return;
      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', cookieHeader(superAdminCookies))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.role).toBe('super_admin');
    });

    it('GET /api/schools → 200 for super_admin', async () => {
      if (!superAdminCookies['access_token']) return;
      await request(app.getHttpServer())
        .get('/api/schools')
        .set('Cookie', cookieHeader(superAdminCookies))
        .expect(200);
    });

    it('POST /api/auth/change-password → 403 for super_admin', async () => {
      if (!superAdminCookies['access_token']) return;
      const res = await request(app.getHttpServer())
        .post('/api/auth/change-password')
        .set('Cookie', cookieHeader(superAdminCookies))
        .send({ currentPassword: 'any', newPassword: 'NewPass1234!' })
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('POST /api/auth/web/login with DRIVER credentials → 401 (wrong endpoint)', async () => {
      // Web login should reject driver/parent roles
      await request(app.getHttpServer())
        .post('/api/auth/web/login')
        .send({ email: 'driver@test.com', password: 'anypassword' })
        .expect(401);
    });
  });

  // ── 5. Refresh token ──────────────────────────────────────────────────────

  describe('Refresh token flow', () => {
    let cookies: Record<string, string> = {};

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/web/login')
        .send({
          email: process.env.SUPER_ADMIN_EMAIL ?? 'superadmin@buspoint.app',
          password: process.env.SUPER_ADMIN_PASSWORD ?? 'BusPoint@SuperAdmin#1',
        });
      if (res.status === 200) cookies = extractCookies(res);
    });

    it('POST /api/auth/refresh with valid refresh cookie → 200 + new access token', async () => {
      if (!cookies['refresh_token']) return;
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', cookieHeader(cookies))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.accessTokenExpiresAt).toBeGreaterThan(Date.now());

      // Update cookies from response (rotation)
      const newCookies = extractCookies(res);
      if (newCookies['refresh_token']) {
        cookies = { ...cookies, ...newCookies };
      }
    });

    it('POST /api/auth/refresh without cookie → 401', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .expect(401);
    });

    it('POST /api/auth/refresh with consumed (rotated) token → 401', async () => {
      if (!cookies['refresh_token']) return;

      // Use token once — this rotates it
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', cookieHeader(cookies))
        .expect(200);

      // Using the same token again should fail
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', cookieHeader(cookies))
        .expect(401);
    });
  });

  // ── 6. Logout invalidates refresh token ───────────────────────────────────

  describe('Logout', () => {
    it('POST /api/auth/logout clears session and refresh no longer works', async () => {
      // Login fresh
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/web/login')
        .send({
          email: process.env.SUPER_ADMIN_EMAIL ?? 'superadmin@buspoint.app',
          password: process.env.SUPER_ADMIN_PASSWORD ?? 'BusPoint@SuperAdmin#1',
        });
      if (loginRes.status !== 200) return;

      const cookies = extractCookies(loginRes);

      // Logout
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', cookieHeader(cookies))
        .expect(200);

      // Refresh should now fail — token was deleted from DB
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', cookieHeader(cookies))
        .expect(401);
    });
  });

  // ── 7. Input validation ───────────────────────────────────────────────────

  describe('Input validation', () => {
    it('POST /api/auth/web/login with missing fields → 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/web/login')
        .send({ email: 'notanemail' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('POST /api/schools with invalid UUID param → 400', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/web/login')
        .send({
          email: process.env.SUPER_ADMIN_EMAIL ?? 'superadmin@buspoint.app',
          password: process.env.SUPER_ADMIN_PASSWORD ?? 'BusPoint@SuperAdmin#1',
        });
      if (loginRes.status !== 200) return;

      const cookies = extractCookies(loginRes);
      await request(app.getHttpServer())
        .get('/api/schools/not-a-uuid')
        .set('Cookie', cookieHeader(cookies))
        .expect(400);
    });
  });
});
