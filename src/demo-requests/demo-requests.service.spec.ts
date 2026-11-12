import { HttpException } from '@nestjs/common';
import { DemoRequestsService } from './demo-requests.service';
import { DemoRequestStatus } from './demo-request.entity';
import type { CreateDemoRequestDto } from './dto/create-demo-request.dto';

vi.mock('../i18n/translate', () => ({ t: (k: string) => k }));

function fakeRepo() {
  const rows: Record<string, unknown>[] = [];
  return {
    rows,
    create: (x: Record<string, unknown>) => x,
    save: vi.fn(async (x: Record<string, unknown>) => {
      const row = { id: `id-${rows.length + 1}`, ...x };
      rows.push(row);
      return row;
    }),
    findOne: vi.fn(async ({ where: { id } }: { where: { id: string } }) => rows.find((r) => r.id === id) ?? null),
  };
}

const valid: CreateDemoRequestDto = {
  schoolName: 'Aldenham International School',
  city: 'Dubai',
  country: 'United Arab Emirates',
  contactName: 'Amira Haddad',
  contactRole: 'Head of Operations',
  email: 'amira@example.edu',
  phone: '+971501234567',
  consent: true,
  elapsedMs: 42_000,
};

describe('DemoRequestsService', () => {
  it('stores a genuine request as NEW with consent timestamp and request meta', async () => {
    const repo = fakeRepo();
    const svc = new DemoRequestsService(repo as never);
    const res = await svc.create(valid, { ip: '10.0.0.1', userAgent: 'jest' });
    expect(res.success).toBe(true);
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]).toMatchObject({ status: DemoRequestStatus.NEW, ip: '10.0.0.1', schoolName: valid.schoolName });
    expect(repo.rows[0].consentAt).toBeInstanceOf(Date);
  });

  it('silently drops honeypot and too-fast submissions (looks like success, saves nothing)', async () => {
    const repo = fakeRepo();
    const svc = new DemoRequestsService(repo as never);
    const a = await svc.create({ ...valid, companyFax: 'spam' }, { ip: '1.1.1.1', userAgent: null });
    const b = await svc.create({ ...valid, elapsedMs: 800 }, { ip: '1.1.1.1', userAgent: null });
    expect(a.success && b.success).toBe(true);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rate-limits a single IP after 5 submissions per hour', async () => {
    const repo = fakeRepo();
    const svc = new DemoRequestsService(repo as never);
    for (let i = 0; i < 5; i++) await svc.create(valid, { ip: '2.2.2.2', userAgent: null });
    await expect(svc.create(valid, { ip: '2.2.2.2', userAgent: null })).rejects.toBeInstanceOf(HttpException);
    // Other visitors are unaffected.
    await expect(svc.create(valid, { ip: '3.3.3.3', userAgent: null })).resolves.toMatchObject({ success: true });
  });

  it('updates status, notes and owner; blank strings clear fields', async () => {
    const repo = fakeRepo();
    const svc = new DemoRequestsService(repo as never);
    await svc.create(valid, { ip: null, userAgent: null });
    const id = repo.rows[0].id as string;
    await svc.update(id, { status: DemoRequestStatus.DEMO_SCHEDULED, notes: 'Thu 10:00 GST', assignedTo: 'Ravi' });
    expect(repo.rows[0]).toMatchObject({ status: 'demo_scheduled', notes: 'Thu 10:00 GST', assignedTo: 'Ravi' });
    await svc.update(id, { notes: '' });
    expect(repo.rows[0].notes).toBeNull();
  });
});
