import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  UnprocessableEntityException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { UploadApiResponse, v2 as CloudinaryType } from 'cloudinary';
import * as streamifier from 'streamifier';
import { PrismaService } from '../prisma/prisma.service';
import { CLOUDINARY } from './cloudinary.provider';
import { MessageType } from '@prisma/client';

const ALLOWED_MIMETYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

@Injectable()
export class FilesService {
  constructor(
    @Inject(CLOUDINARY) private readonly cloudinary: typeof CloudinaryType,
    private readonly prisma: PrismaService,
  ) {}

  async uploadAvatar(userId: string, file: Express.Multer.File): Promise<{ url: string }> {
    this.validateFile(file);

    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Profile not found');

    const url = await this.streamUpload(file.buffer, 'avatars');

    await this.prisma.profile.update({
      where: { userId },
      data: { avatarUrl: url },
    });

    return { url };
  }

  async uploadChatImage(chatId: string, userId: string, file: Express.Multer.File) {
    this.validateFile(file);

    const participant = await this.prisma.chatParticipant.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });
    if (!participant) throw new ForbiddenException('Access denied');

    const url = await this.streamUpload(file.buffer, 'chat');

    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          chatId,
          senderId: userId,
          content: url,
          type: MessageType.IMAGE,
        },
      }),
      this.prisma.chat.update({
        where: { id: chatId },
        data: { updatedAt: new Date() },
      }),
    ]);

    return message;
  }

  private validateFile(file: Express.Multer.File): void {
    if (!file) throw new UnprocessableEntityException('No file provided');
    if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
      throw new UnprocessableEntityException(
        'Invalid file type. Only jpeg, jpg, png, webp are allowed',
      );
    }
    if (file.size > MAX_SIZE_BYTES) {
      throw new PayloadTooLargeException('File exceeds the 5 MB limit');
    }
  }

  private streamUpload(buffer: Buffer, folder: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = this.cloudinary.uploader.upload_stream(
        { folder },
        (error, result: UploadApiResponse) => {
          if (error) return reject(error);
          resolve(result.secure_url);
        },
      );
      streamifier.createReadStream(buffer).pipe(uploadStream);
    });
  }
}
