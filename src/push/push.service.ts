import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { App, applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, Message } from 'firebase-admin/messaging';
import { PushToken } from './push-token.entity';
import type { RegisterPushTokenDto } from './dto/push-token.dto';

/** Android channels created by the app (src/lib/push.ts). */
export type PushChannel = 'trip-updates' | 'safety-alerts' | 'general';
/** Tabs the app can open from a notification. */
export type PushScreen = 'Trip' | 'Map' | 'History' | 'Profile';

export interface PushMessage {
  title: string;
  body: string;
  channel: PushChannel;
  /** Machine-readable kind, e.g. `bus_approaching`. */
  type: string;
  screen: PushScreen;
  /** Extra data for the app (string values only). */
  data?: Record<string, string>;
  /** Same tag = replaces the previous notification in the tray. */
  tag?: string;
  /** Drop the push if the phone can't get it in time (ms). */
  ttlMs?: number;
}

/** FCM tokens that will never work again — delete them. */
const DEAD_TOKEN_CODES = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);
const FCM_BATCH = 500;
const APP_NAME = 'buspoint-push';

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private app: App | null = null;

  constructor(
    @InjectRepository(PushToken) private readonly tokens: Repository<PushToken>,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.app = this.initFirebase();
  }

  get enabled(): boolean {
    return this.app !== null;
  }

  private initFirebase(): App | null {
    const existing = getApps().find((a) => a.name === APP_NAME);
    if (existing) return existing;
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKey = this.config.get<string>('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');
    try {
      if (projectId && clientEmail && privateKey) {
        return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId }, APP_NAME);
      }
      if (this.config.get<string>('GOOGLE_APPLICATION_CREDENTIALS')) {
        return initializeApp({ credential: applicationDefault(), ...(projectId && { projectId }) }, APP_NAME);
      }
    } catch (err) {
      this.logger.error(`Firebase init failed — pushes disabled: ${(err as Error).message}`);
      return null;
    }
    this.logger.warn('FIREBASE_* not set — push notifications are disabled');
    return null;
  }

  // ── Tokens ───────────────────────────────────────────────────────────────────

  /** Upsert by token: a token that moves to another account (sign out → sign in) follows the new user. */
  async register(userId: string, dto: RegisterPushTokenDto): Promise<void> {
    await this.tokens.upsert(
      {
        userId,
        token: dto.token,
        provider: dto.provider ?? 'fcm',
        platform: dto.platform ?? null,
        appVersion: dto.appVersion ?? null,
        lastSeenAt: new Date(),
      },
      { conflictPaths: ['token'] },
    );
  }

  /** Sign-out / session expired on a device. Already gone is fine. */
  async remove(token: string): Promise<void> {
    await this.tokens.delete({ token });
  }

  // ── Sending ──────────────────────────────────────────────────────────────────

  /** Best effort: never throws. Returns how many devices FCM accepted. */
  async sendToUsers(userIds: string[], msg: PushMessage): Promise<number> {
    const ids = [...new Set(userIds)];
    if (!this.app || ids.length === 0) return 0;
    try {
      const rows = await this.tokens.find({ where: { userId: In(ids) }, select: { token: true } });
      const tokens = rows.map((r) => r.token);
      let sent = 0;
      for (let i = 0; i < tokens.length; i += FCM_BATCH) {
        sent += await this.sendBatch(tokens.slice(i, i + FCM_BATCH), msg);
      }
      return sent;
    } catch (err) {
      this.logger.warn(`push "${msg.type}" failed: ${(err as Error).message}`);
      return 0;
    }
  }

  private async sendBatch(tokens: string[], msg: PushMessage): Promise<number> {
    if (tokens.length === 0) return 0;
    const data: Record<string, string> = { ...msg.data, type: msg.type, screen: msg.screen };
    const messages: Message[] = tokens.map((token) => ({
      token,
      notification: { title: msg.title, body: msg.body },
      data,
      android: {
        priority: 'high',
        ...(msg.ttlMs != null && { ttl: msg.ttlMs }),
        notification: { channelId: msg.channel, ...(msg.tag && { tag: msg.tag }) },
      },
    }));
    const res = await getMessaging(this.app!).sendEach(messages);
    const dead = res.responses.flatMap((r, i) => (r.error && DEAD_TOKEN_CODES.has(r.error.code) ? [tokens[i]] : []));
    if (dead.length > 0) await this.tokens.delete({ token: In(dead) });
    const otherErrors = res.responses.filter((r) => r.error && !DEAD_TOKEN_CODES.has(r.error.code));
    if (otherErrors.length > 0) this.logger.warn(`push "${msg.type}": ${otherErrors.length} failed (${otherErrors[0].error!.code})`);
    return res.successCount;
  }
}
