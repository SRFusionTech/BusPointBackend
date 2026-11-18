import { PushService } from './push.service';

const sendEach = vi.fn();
vi.mock('firebase-admin/app', () => ({
  getApps: () => [],
  initializeApp: () => ({ name: 'buspoint-push' }),
  cert: (x: unknown) => x,
  applicationDefault: () => ({}),
}));
vi.mock('firebase-admin/messaging', () => ({ getMessaging: () => ({ sendEach }) }));

function make(env: Record<string, string | undefined>) {
  const repo = {
    upsert: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    find: vi.fn(async () => [{ token: 'tok-a' }, { token: 'tok-dead' }, { token: 'tok-c' }]),
  };
  const svc = new PushService(repo as never, { get: (k: string) => env[k] } as never);
  svc.onModuleInit();
  return { svc, repo };
}

const creds = { FIREBASE_PROJECT_ID: 'p', FIREBASE_CLIENT_EMAIL: 'e@p.iam', FIREBASE_PRIVATE_KEY: 'k\\nk' };
const msg = { title: 'T', body: 'B', channel: 'trip-updates' as const, type: 'bus_approaching', screen: 'Map' as const, data: { tripId: 'T1' }, tag: 'trip-T1', ttlMs: 1000 };

describe('PushService', () => {
  beforeEach(() => {
    sendEach.mockReset();
  });

  it('is disabled (sends nothing, no throw) without Firebase credentials', async () => {
    const { svc, repo } = make({});
    expect(svc.enabled).toBe(false);
    await expect(svc.sendToUsers(['u1'], msg)).resolves.toBe(0);
    expect(repo.find).not.toHaveBeenCalled();
  });

  it('upserts by token so a device moves to the newly signed-in user', async () => {
    const { svc, repo } = make(creds);
    await svc.register('u2', { token: 'x'.repeat(30), platform: 'android', appVersion: '2.0.0' });
    expect(repo.upsert).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u2', token: 'x'.repeat(30), provider: 'fcm' }), { conflictPaths: ['token'] });
  });

  it('remove deletes the device token', async () => {
    const { svc, repo } = make(creds);
    await svc.remove('tok');
    expect(repo.delete).toHaveBeenCalledWith({ token: 'tok' });
  });

  it('sends one FCM message per device with channel, tag, ttl and string data; deletes dead tokens', async () => {
    const { svc, repo } = make(creds);
    sendEach.mockResolvedValue({
      successCount: 2,
      responses: [{ success: true }, { success: false, error: { code: 'messaging/registration-token-not-registered' } }, { success: true }],
    });
    await expect(svc.sendToUsers(['u1', 'u1', 'u2'], msg)).resolves.toBe(2);
    const sent = sendEach.mock.calls[0][0];
    expect(sent).toHaveLength(3);
    expect(sent[0]).toEqual({
      token: 'tok-a',
      notification: { title: 'T', body: 'B' },
      data: { tripId: 'T1', type: 'bus_approaching', screen: 'Map' },
      android: { priority: 'high', ttl: 1000, notification: { channelId: 'trip-updates', tag: 'trip-T1' } },
    });
    expect(repo.delete).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(repo.delete.mock.calls[0])).toContain('tok-dead');
  });

  it('never throws when FCM fails', async () => {
    const { svc } = make(creds);
    sendEach.mockRejectedValue(new Error('network'));
    await expect(svc.sendToUsers(['u1'], msg)).resolves.toBe(0);
  });
});
