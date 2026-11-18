/**
 * Device sessions (refresh token rotation) — runs AuthService against a REAL Postgres database.
 *
 * Opt-in: set AUTH_TEST_DATABASE_URL to a THROWAWAY database (schema is created with synchronize and
 * all rows are wiped). Without it the suite is skipped, so `npm test` needs no database.
 *
 *   AUTH_TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/buspoint_authtest npx vitest run src/auth/auth-sessions.spec.ts
 */
import { HttpException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import type { I18nService } from 'nestjs-i18n';
import { DataSource, Repository } from 'typeorm';
import { AuthService } from './auth.service';
import { RefreshToken } from './refresh-token.entity';
import { User } from '../users/user.entity';
import { School } from '../schools/school.entity';
import { Plan } from '../plans/plan.entity';
import { Role } from '../common/enums/role.enum';

const URL = process.env.AUTH_TEST_DATABASE_URL;
const DAY = 24 * 60 * 60_000;

type Pair = { accessToken: string; refreshToken: string; accessTokenExpiresIn: number };

describe.skipIf(!URL)('Auth device sessions (Postgres)', () => {
  let ds: DataSource;
  let auth: AuthService;
  let tokens: Repository<RefreshToken>;
  let users: Repository<User>;
  let schools: Repository<School>;
  let user: User;

  const login = async (u: User = user): Promise<Pair> =>
    // issueTokens is what web/mobile login call after checking the password.
    ((await (auth as unknown as { issueTokens: (u: User, d: number) => Promise<{ data: Pair }> }).issueTokens(u, 180)).data);
  const refresh = async (raw: string): Promise<Pair> => ((await auth.refresh(raw)) as unknown as { data: Pair }).data;
  const rejects = async (raw: string) => {
    await expect(auth.refresh(raw)).rejects.toBeInstanceOf(UnauthorizedException);
  };

  beforeAll(async () => {
    ds = new DataSource({ type: 'postgres', url: URL, entities: [User, RefreshToken, School, Plan], synchronize: true, dropSchema: true });
    await ds.initialize();
    tokens = ds.getRepository(RefreshToken);
    users = ds.getRepository(User);
    schools = ds.getRepository(School);
    const cfg: Record<string, number> = { JWT_ACCESS_TTL_MINUTES: 15, JWT_REFRESH_TTL_DAYS_WEB: 30, JWT_REFRESH_TTL_DAYS_MOBILE: 180 };
    const config = { get: (k: string) => cfg[k] } as unknown as ConfigService;
    const i18n = { translate: (k: string) => k } as unknown as I18nService;
    const none = {} as Repository<never>;
    auth = new AuthService(new JwtService({ secret: 'test-secret-test-secret-test-secret-32' }), users, tokens, schools, none, none, none, none, i18n, config, ds);
  });

  afterAll(async () => {
    await ds?.destroy();
  });

  beforeEach(async () => {
    vi.useRealTimers();
    await tokens.createQueryBuilder().delete().execute();
    await users.createQueryBuilder().delete().execute();
    await schools.createQueryBuilder().delete().execute();
    user = await users.save(users.create({ passwordHash: 'x', role: Role.PARENT, schoolId: null, isActive: true }));
  });

  afterEach(() => vi.useRealTimers());

  /** Move the clock (Date only — DB I/O keeps real timers). */
  const advance = (ms: number) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + ms);
  };

  it('normal use: each refresh gives a new token that keeps working; expiresIn is returned', async () => {
    const a = await login();
    const b = await refresh(a.refreshToken);
    expect(b.refreshToken).not.toBe(a.refreshToken);
    expect(b.accessTokenExpiresIn).toBe(15 * 60);
    const c = await refresh(b.refreshToken);
    expect(c.refreshToken).toBeTruthy();
  });

  it('lost response: retrying with the old token right away still works (no logout)', async () => {
    const a = await login();
    await refresh(a.refreshToken); // response never reached the phone
    const retry = await refresh(a.refreshToken);
    await refresh(retry.refreshToken); // and the session continues
  });

  it('lost response + hours offline: old token still accepted because its successor was never used', async () => {
    const a = await login();
    const lost = await refresh(a.refreshToken);
    advance(3 * 60 * 60_000);
    const retry = await refresh(a.refreshToken);
    await refresh(retry.refreshToken);
    await rejects(lost.refreshToken); // the undelivered token was retired
  });

  it('two app contexts refreshing at the same moment both stay signed in', async () => {
    const a = await login();
    const [x, y] = await Promise.all([refresh(a.refreshToken), refresh(a.refreshToken)]);
    await refresh(x.refreshToken);
    await refresh(y.refreshToken);
  });

  it('replay of an old token after the session moved on → whole session revoked', async () => {
    const a = await login();
    const b = await refresh(a.refreshToken);
    const c = await refresh(b.refreshToken); // client clearly received + used b
    advance(5 * 60_000);
    await rejects(a.refreshToken); // stolen / stale copy
    await rejects(c.refreshToken); // the session is gone for everyone holding it
  });

  it('sign-out ends only that device session', async () => {
    const phone = await login();
    const tablet = await login();
    const phone2 = await refresh(phone.refreshToken);
    await auth.logout(phone2.refreshToken);
    await rejects(phone2.refreshToken);
    await rejects(phone.refreshToken);
    await refresh(tablet.refreshToken); // other device unaffected
  });

  it('sliding expiry: used regularly → never expires; unused past the TTL → expires', async () => {
    let t = await login();
    for (let i = 0; i < 3; i++) {
      advance(170 * DAY); // 170 days apart, 510 days in total
      t = await refresh(t.refreshToken);
    }
    advance(181 * DAY);
    await rejects(t.refreshToken);
  });

  it('table stays bounded: 40 refreshes leave at most a few rows per session', async () => {
    let t = await login();
    for (let i = 0; i < 40; i++) {
      advance(15 * 60_000);
      t = await refresh(t.refreshToken);
    }
    const rows = await tokens.count({ where: { userId: user.id } });
    expect(rows).toBeLessThanOrEqual(3);
  });

  it('school plan expired → refresh refused (402) but the token is NOT consumed', async () => {
    const school = await schools.save(schools.create({ name: 'S', address: 'A', planExpiresAt: new Date(Date.now() - DAY) } as Partial<School>));
    user = await users.save(users.create({ passwordHash: 'x', role: Role.PARENT, schoolId: school.id, isActive: true }));
    const a = await login(user);
    await expect(auth.refresh(a.refreshToken)).rejects.toBeInstanceOf(HttpException);
    await schools.update({ id: school.id }, { planExpiresAt: new Date(Date.now() + 30 * DAY) });
    await refresh(a.refreshToken); // plan renewed → same token works
  });

  it('tokens issued before sessions existed (no family) still refresh', async () => {
    const a = await login();
    await tokens.update({ userId: user.id }, { familyId: null });
    const b = await refresh(a.refreshToken);
    await refresh(b.refreshToken);
  });
});
