import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { MessageType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async handleConnection(socket: Socket) {
    const token =
      (socket.handshake.auth?.token as string) ||
      (socket.handshake.query?.token as string);

    if (!token) {
      socket.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify<{ sub: string }>(token);
      socket.data.userId = payload.sub;
      // Sala personal para recibir updates de chat sin estar dentro de un chat
      socket.join(`user:${payload.sub}`);
    } catch {
      socket.disconnect();
    }
  }

  handleDisconnect(_socket: Socket) {}

  @SubscribeMessage('join_chat')
  async handleJoinChat(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { chatId: string },
  ) {
    const { chatId } = data;
    const userId: string = socket.data.userId;

    const participant = await this.prisma.chatParticipant.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });

    if (!participant) {
      socket.emit('error', { message: 'Access denied' });
      return;
    }

    socket.join(chatId);
  }

  @SubscribeMessage('leave_chat')
  async handleLeaveChat(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { chatId: string },
  ) {
    const { chatId } = data;
    const userId: string = socket.data.userId;

    const participant = await this.prisma.chatParticipant.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });

    if (!participant) {
      socket.emit('error', { message: 'Access denied' });
      return;
    }

    socket.leave(chatId);
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { chatId: string; content: string; type?: MessageType },
  ) {
    const { chatId, content, type } = data;
    const userId: string = socket.data.userId;

    const participant = await this.prisma.chatParticipant.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });

    if (!participant) {
      socket.emit('error', { message: 'Access denied' });
      return;
    }

    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          chatId,
          senderId: userId,
          content,
          type: type ?? MessageType.TEXT,
        },
      }),
      this.prisma.chat.update({
        where: { id: chatId },
        data: { updatedAt: new Date() },
      }),
    ]);

    this.server.to(chatId).emit('new_message', {
      id: message.id,
      chatId: message.chatId,
      senderId: message.senderId,
      content: message.content,
      type: message.type,
      createdAt: message.createdAt,
    });

    // Push notification + actualizar lista de chats del destinatario (fire-and-forget)
    void this.notifyRecipient(chatId, userId, message.type, content, message.createdAt);
  }

  private async notifyRecipient(
    chatId: string,
    senderId: string,
    type: MessageType,
    content: string,
    sentAt: Date,
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

    const preview = type === MessageType.IMAGE ? '📷 Imagen' : content.slice(0, 100);
    const title = senderProfile?.displayName ?? 'Nuevo mensaje';

    // Actualizar lista de chats en tiempo real (sin estar dentro del chat)
    this.server.to(`user:${otherParticipant.userId}`).emit('chat_updated', {
      chatId,
      lastMessage: preview,
      lastMessageAt: sentAt.toISOString(),
    });

    // Push notification
    await this.notifications.sendToUser(otherParticipant.userId, title, preview, {
      type: 'new_message',
      chatId,
      name: title,
    });
  }

  /** Emite un evento a la sala personal de un usuario (usado por otros módulos) */
  emitToUser(userId: string, event: string, data: unknown): void {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { chatId: string },
  ) {
    const userId: string = socket.data.userId;
    socket.to(data.chatId).emit('user_typing', { chatId: data.chatId, userId });
  }

  @SubscribeMessage('stop_typing')
  handleStopTyping(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { chatId: string },
  ) {
    const userId: string = socket.data.userId;
    socket.to(data.chatId).emit('user_stop_typing', { chatId: data.chatId, userId });
  }
}
