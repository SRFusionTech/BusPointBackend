import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    if (admin.apps.length === 0) {
      const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
      const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
      const privateKey = this.configService
        .get<string>('FIREBASE_PRIVATE_KEY')
        ?.replace(/\\n/g, '\n');

      if (!projectId || !clientEmail || !privateKey) {
        this.logger.warn(
          'Firebase credentials not fully configured — token verification disabled',
        );
        return;
      }

      admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      });

      this.logger.log('Firebase Admin SDK initialized');
    }
  }

  async verifyToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    return admin.auth().verifyIdToken(idToken);
  }

  /**
   * Programmatically create a Firebase Auth user (phone + optional email).
   * Phone must be a 10-digit Indian number (country code +91 is prepended).
   * Returns the Firebase UID on success, or null if Firebase is not configured.
   * Throws if Firebase is configured but the user already exists or creation fails.
   */
  async createUser(
    phone: string,
    displayName: string,
    email?: string,
  ): Promise<string | null> {
    if (admin.apps.length === 0) {
      this.logger.warn('Firebase not initialized — skipping Firebase user creation');
      return null;
    }

    const phoneNumber = `+91${phone}`;

    // Default password pattern: Bus@<phone>  e.g. Bus@9876543210
    const record = await admin.auth().createUser({
      phoneNumber,
      displayName,
      password: `Bus@${phone}`,
      ...(email ? { email } : {}),
    });

    this.logger.log(`Firebase user created: uid=${record.uid} phone=${phoneNumber}`);
    return record.uid;
  }

  /**
   * Delete a Firebase Auth user by UID.
   * Used for rollback when DB save fails after Firebase user was already created.
   */
  async deleteUser(uid: string): Promise<void> {
    if (admin.apps.length === 0) return;
    try {
      await admin.auth().deleteUser(uid);
      this.logger.log(`Firebase user deleted (rollback): uid=${uid}`);
    } catch (err) {
      this.logger.error(`Failed to delete Firebase user uid=${uid} during rollback`, err);
    }
  }

  async sendPushNotification(
    fcmToken: string,
    title: string,
    body: string,
    data: Record<string, string> = {},
  ): Promise<void> {
    if (admin.apps.length === 0) {
      this.logger.warn('Firebase not initialized — skipping push notification');
      return;
    }
    try {
      await admin.messaging().send({
        token: fcmToken,
        notification: { title, body },
        data,
        android: { priority: 'high' },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
      });
    } catch (err) {
      this.logger.error(`Failed to send FCM notification to token ${fcmToken}`, err);
    }
  }
}
