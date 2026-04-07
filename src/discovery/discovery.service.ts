import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DiscoveryService {
  constructor(private prisma: PrismaService) {}

  async getDiscoveryFeed(userId: string) {
    const swipedRecords = await this.prisma.swipeRecord.findMany({
      where: { userId },
      select: { targetId: true },
    });
    const swipedIds = swipedRecords.map((r) => r.targetId);

    const users = await this.prisma.user.findMany({
      where: {
        id: { notIn: [userId, ...swipedIds] },
        profile: { isNot: null },
      },
      include: {
        profile: {
          select: {
            displayName: true,
            age: true,
            bio: true,
            interests: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return users.map((u) => ({
      user: { id: u.id },
      profile: u.profile,
    }));
  }
}
