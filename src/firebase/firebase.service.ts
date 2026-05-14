import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    if (admin.apps.length === 0) {
      const credPath = this.configService.get<string>(
        'GOOGLE_APPLICATION_CREDENTIALS',
      );

      if (credPath) {
        try {
          // require the JSON credentials file (resolve relative paths)
          const path = require('path');
          const full = path.isAbsolute(credPath)
            ? credPath
            : path.resolve(process.cwd(), credPath);
          const svc = require(full);
          admin.initializeApp({ credential: admin.credential.cert(svc) });
          this.logger.log(
            `Firebase Admin SDK initialized using ${credPath}`,
          );
          return;
        } catch (err) {
          this.logger.warn(
            `Failed to load GOOGLE_APPLICATION_CREDENTIALS (${credPath}): ${err.message}`,
          );
        }
      }

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
}
