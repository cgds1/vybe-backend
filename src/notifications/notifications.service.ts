import { Injectable, Inject, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { PrismaService } from '../prisma/prisma.service';
import { FIREBASE_ADMIN } from './firebase.provider';
import { RegisterTokenDto } from './dto/register-token.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(FIREBASE_ADMIN) private readonly firebase: admin.app.App,
    private readonly prisma: PrismaService,
  ) {}

  async registerToken(userId: string, dto: RegisterTokenDto): Promise<{ message: string }> {
    await this.prisma.$transaction([
      this.prisma.deviceToken.deleteMany({ where: { userId } }),
      this.prisma.deviceToken.create({ data: { userId, token: dto.token } }),
    ]);
    return { message: 'Token registered' };
  }

  async removeToken(userId: string): Promise<void> {
    await this.prisma.deviceToken.deleteMany({ where: { userId } });
  }

  async sendToUser(
    recipientId: string,
    title: string,
    body: string,
  ): Promise<void> {
    const deviceToken = await this.prisma.deviceToken.findFirst({
      where: { userId: recipientId },
    });
    if (!deviceToken) return;

    try {
      await this.firebase.messaging().send({
        token: deviceToken.token,
        notification: { title, body },
      });
    } catch (err) {
      this.logger.error(
        `FCM send failed for user ${recipientId}: ${(err as Error).message}`,
      );
    }
  }
}
