import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SwipeDto } from './dto/swipe.dto';

const PROFILE_SELECT = {
  displayName: true,
  age: true,
  bio: true,
  interests: true,
  avatarUrl: true,
} as const;

@Injectable()
export class MatchesService {
  constructor(private prisma: PrismaService) {}

  async swipe(userId: string, dto: SwipeDto) {
    if (userId === dto.targetId) {
      throw new BadRequestException('Cannot swipe on yourself');
    }

    const existing = await this.prisma.swipeRecord.findUnique({
      where: { userId_targetId: { userId, targetId: dto.targetId } },
    });
    if (existing) {
      throw new ConflictException('Already swiped on this user');
    }

    const swipe = await this.prisma.swipeRecord.create({
      data: { userId, targetId: dto.targetId, action: dto.action },
    });

    let match: Awaited<ReturnType<typeof this.prisma.match.create>> | null = null;
    if (dto.action === 'LIKE') {
      const mutualLike = await this.prisma.swipeRecord.findUnique({
        where: { userId_targetId: { userId: dto.targetId, targetId: userId } },
      });

      if (mutualLike?.action === 'LIKE') {
        const [user1Id, user2Id] = [userId, dto.targetId].sort();
        match = await this.prisma.match.create({
          data: { user1Id, user2Id },
        });
      }
    }

    return { swipe, match };
  }

  async getMyMatches(userId: string) {
    const matches = await this.prisma.match.findMany({
      where: { OR: [{ user1Id: userId }, { user2Id: userId }] },
      include: {
        user1: { include: { profile: { select: PROFILE_SELECT } } },
        user2: { include: { profile: { select: PROFILE_SELECT } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return matches.map((m) => {
      const other = m.user1Id === userId ? m.user2 : m.user1;
      return {
        id: m.id,
        createdAt: m.createdAt,
        other: {
          user: { id: other.id },
          profile: other.profile,
        },
      };
    });
  }

  async getMatchById(matchId: string, userId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        user1: { include: { profile: { select: PROFILE_SELECT } } },
        user2: { include: { profile: { select: PROFILE_SELECT } } },
      },
    });

    if (!match) throw new NotFoundException('Match not found');
    if (match.user1Id !== userId && match.user2Id !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const other = match.user1Id === userId ? match.user2 : match.user1;
    return {
      id: match.id,
      createdAt: match.createdAt,
      other: {
        user: { id: other.id },
        profile: other.profile,
      },
    };
  }
}
