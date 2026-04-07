import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SendMessageDto } from './dto/send-message.dto';
import { MessagesQueryDto } from './dto/messages-query.dto';
import { MessageType } from '@prisma/client';

const OTHER_PROFILE_SELECT = {
  displayName: true,
  avatarUrl: true,
} as const;

@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async openChat(matchId: string, userId: string) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Match not found');
    if (match.user1Id !== userId && match.user2Id !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const existing = await this.prisma.chat.findUnique({
      where: { matchId },
      include: { participants: { select: { userId: true } } },
    });
    if (existing) {
      return {
        id: existing.id,
        matchId: existing.matchId,
        createdAt: existing.createdAt,
        participants: existing.participants,
      };
    }

    const chat = await this.prisma.chat.create({
      data: {
        matchId,
        participants: {
          create: [{ userId: match.user1Id }, { userId: match.user2Id }],
        },
      },
      include: { participants: { select: { userId: true } } },
    });

    return {
      id: chat.id,
      matchId: chat.matchId,
      createdAt: chat.createdAt,
      participants: chat.participants,
    };
  }

  async getMyChats(userId: string) {
    const participations = await this.prisma.chatParticipant.findMany({
      where: { userId },
      select: { chatId: true },
    });
    const chatIds = participations.map((p) => p.chatId);

    const chats = await this.prisma.chat.findMany({
      where: { id: { in: chatIds } },
      orderBy: { updatedAt: 'desc' },
      include: {
        participants: {
          include: {
            user: { include: { profile: { select: OTHER_PROFILE_SELECT } } },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { content: true, type: true, createdAt: true, senderId: true },
        },
      },
    });

    return chats.map((chat) => {
      const other = chat.participants.find((p) => p.userId !== userId);
      const lastMessage = chat.messages[0] ?? null;
      return {
        id: chat.id,
        matchId: chat.matchId,
        updatedAt: chat.updatedAt,
        lastMessage,
        otherParticipant: other
          ? { userId: other.userId, profile: other.user.profile }
          : null,
      };
    });
  }

  async getMessages(chatId: string, userId: string, query: MessagesQueryDto) {
    await this.assertParticipant(chatId, userId);

    const limit = query.limit ?? 20;
    let cursorFilter: { createdAt: { lt: Date } } | undefined;

    if (query.cursor) {
      const cursorMsg = await this.prisma.message.findUnique({
        where: { id: query.cursor },
        select: { createdAt: true },
      });
      if (cursorMsg) {
        cursorFilter = { createdAt: { lt: cursorMsg.createdAt } };
      }
    }

    const messages = await this.prisma.message.findMany({
      where: { chatId, ...cursorFilter },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = messages.length > limit;
    const data = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return { data, nextCursor };
  }

  async sendMessage(chatId: string, userId: string, dto: SendMessageDto) {
    await this.assertParticipant(chatId, userId);

    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          chatId,
          senderId: userId,
          content: dto.content,
          type: dto.type ?? MessageType.TEXT,
        },
      }),
      this.prisma.chat.update({
        where: { id: chatId },
        data: { updatedAt: new Date() },
      }),
    ]);

    void this.notifyMessageRecipient(chatId, userId, dto.content.slice(0, 100));

    return message;
  }

  private async notifyMessageRecipient(
    chatId: string,
    senderId: string,
    body: string,
  ): Promise<void> {
    const [senderProfile, otherParticipant] = await Promise.all([
      this.prisma.profile.findUnique({
        where: { userId: senderId },
        select: { displayName: true },
      }),
      this.prisma.chatParticipant.findFirst({
        where: { chatId, NOT: { userId: senderId } },
        select: { userId: true },
      }),
    ]);

    if (!otherParticipant) return;

    await this.notifications.sendToUser(
      otherParticipant.userId,
      senderProfile?.displayName ?? 'Nuevo mensaje',
      body,
    );
  }

  private async assertParticipant(chatId: string, userId: string) {
    const participant = await this.prisma.chatParticipant.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });
    if (!participant) throw new ForbiddenException('Access denied');
  }
}
