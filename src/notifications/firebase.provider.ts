import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

export const FIREBASE_ADMIN = 'FIREBASE_ADMIN';

export const FirebaseAdminProvider: Provider = {
  provide: FIREBASE_ADMIN,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const privateKey = config
      .get<string>('FIREBASE_PRIVATE_KEY')!
      .replace(/\\n/g, '\n');

    return admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.get<string>('FIREBASE_PROJECT_ID'),
        clientEmail: config.get<string>('FIREBASE_CLIENT_EMAIL'),
        privateKey,
      }),
    });
  },
};
