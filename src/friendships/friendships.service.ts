import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { FriendshipStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RequestFriendshipDto } from './dto/request-friendship.dto';
import { FriendshipQueryDto } from './dto/friendship-query.dto';

const OTHER_PROFILE_SELECT = {
  displayName: true,
  age: true,
  avatarUrl: true,
} as const;

@Injectable()
export class FriendshipsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async request(userId: string, dto: RequestFriendshipDto) {
    if (userId === dto.receiverId) {
      throw new BadRequestException('Cannot send friend request to yourself');
    }

    const existing = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { initiatorId: userId, receiverId: dto.receiverId },
          { initiatorId: dto.receiverId, receiverId: userId },
        ],
      },
    });
    if (existing) {
      throw new ConflictException('Friendship already exists between these users');
    }

    const friendship = await this.prisma.friendship.create({
      data: { initiatorId: userId, receiverId: dto.receiverId },
    });

    void this.notifyFriendRequest(userId, dto.receiverId);

    return friendship;
  }

  private async notifyFriendRequest(initiatorId: string, receiverId: string): Promise<void> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId: initiatorId },
      select: { displayName: true },
    });

    await this.notifications.sendToUser(
      receiverId,
      'Solicitud de amistad',
      `${profile?.displayName ?? 'Alguien'} quiere ser tu amigo`,
    );
  }

  async accept(friendshipId: string, userId: string) {
    const friendship = await this.prisma.friendship.findUnique({
      where: { id: friendshipId },
    });
    if (!friendship) throw new NotFoundException('Friendship not found');
    if (friendship.receiverId !== userId) {
      throw new ForbiddenException('Only the receiver can accept the request');
    }
    if (friendship.status !== FriendshipStatus.PENDING) {
      throw new BadRequestException('Friendship is not in PENDING status');
    }

    const updated = await this.prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: FriendshipStatus.ACCEPTED },
    });

    void this.notifyFriendAccepted(userId, friendship.initiatorId);

    return updated;
  }

  private async notifyFriendAccepted(acceptorId: string, initiatorId: string): Promise<void> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId: acceptorId },
      select: { displayName: true },
    });

    await this.notifications.sendToUser(
      initiatorId,
      'Solicitud aceptada',
      `${profile?.displayName ?? 'Alguien'} aceptó tu solicitud`,
    );
  }

  async block(friendshipId: string, userId: string) {
    const friendship = await this.prisma.friendship.findUnique({
      where: { id: friendshipId },
    });
    if (!friendship) throw new NotFoundException('Friendship not found');
    if (friendship.initiatorId !== userId && friendship.receiverId !== userId) {
      throw new ForbiddenException('You are not a participant of this friendship');
    }

    return this.prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: FriendshipStatus.BLOCKED },
    });
  }

  async remove(friendshipId: string, userId: string) {
    const friendship = await this.prisma.friendship.findUnique({
      where: { id: friendshipId },
    });
    if (!friendship) throw new NotFoundException('Friendship not found');
    if (friendship.initiatorId !== userId && friendship.receiverId !== userId) {
      throw new ForbiddenException('You are not a participant of this friendship');
    }

    await this.prisma.friendship.delete({ where: { id: friendshipId } });
  }

  async findAll(userId: string, query: FriendshipQueryDto) {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        OR: [{ initiatorId: userId }, { receiverId: userId }],
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        initiator: { include: { profile: { select: OTHER_PROFILE_SELECT } } },
        receiver: { include: { profile: { select: OTHER_PROFILE_SELECT } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return friendships.map((f) => {
      const other = f.initiatorId === userId ? f.receiver : f.initiator;
      return {
        id: f.id,
        status: f.status,
        createdAt: f.createdAt,
        other: { id: other.id, profile: other.profile },
      };
    });
  }

  async findPending(userId: string) {
    const friendships = await this.prisma.friendship.findMany({
      where: { receiverId: userId, status: FriendshipStatus.PENDING },
      include: {
        initiator: { include: { profile: { select: OTHER_PROFILE_SELECT } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return friendships.map((f) => ({
      id: f.id,
      status: f.status,
      createdAt: f.createdAt,
      other: { id: f.initiator.id, profile: f.initiator.profile },
    }));
  }
}
