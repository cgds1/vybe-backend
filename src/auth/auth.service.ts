import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import * as bcrypt from 'bcrypt';
import { createHash, randomInt } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private mail: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
      },
    });

    const code = this.generateCode();
    const hashedCode = await bcrypt.hash(code, 10);
    const expiry = new Date(Date.now() + 15 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { verifyCode: hashedCode, verifyCodeExpiry: expiry, verifyAttempts: 0 },
    });

    await this.mail.sendVerificationEmail(dto.email, code);

    const tokens = await this.generateTokens(user.id, user.email);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    const { password, refreshToken, verifyCode, verifyCodeExpiry, resetCode, resetCodeExpiry, verifyAttempts, resetAttempts, ...safe } = user;
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: safe,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isVerified) {
      throw new ForbiddenException('Email not verified. Please check your inbox.');
    }

    const tokens = await this.generateTokens(user.id, user.email);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    const { password, refreshToken, verifyCode, verifyCodeExpiry, resetCode, resetCodeExpiry, verifyAttempts, resetAttempts, ...safe } = user;
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: safe,
    };
  }

  async refreshTokens(refreshToken: string) {
    let payload: { sub: string; email: string };
    try {
      payload = this.jwt.verify(refreshToken, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenValid = await bcrypt.compare(this.hashToken(refreshToken), user.refreshToken);
    if (!tokenValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokens = await this.generateTokens(user.id, user.email);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new BadRequestException('Invalid request');
    }

    if (user.isVerified) {
      throw new BadRequestException('Email already verified');
    }

    if (!user.verifyCode || !user.verifyCodeExpiry) {
      throw new BadRequestException('Verification code expired or not found. Please request a new one.');
    }

    if (user.verifyCodeExpiry < new Date()) {
      throw new BadRequestException('Verification code expired. Please request a new one.');
    }

    if (user.verifyAttempts >= 5) {
      throw new BadRequestException('Too many failed attempts. Please request a new code.');
    }

    const codeValid = await bcrypt.compare(dto.code, user.verifyCode);
    if (!codeValid) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { verifyAttempts: { increment: 1 } },
      });
      throw new BadRequestException('Invalid verification code');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verifyCode: null,
        verifyCodeExpiry: null,
        verifyAttempts: 0,
      },
    });

    return { message: 'Email verified successfully' };
  }

  async resendVerification(dto: ResendVerificationDto) {
    const genericResponse = { message: 'If the email exists, a verification code has been sent.' };

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || user.isVerified) {
      return genericResponse;
    }

    const code = this.generateCode();
    const hashedCode = await bcrypt.hash(code, 10);
    const expiry = new Date(Date.now() + 15 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { verifyCode: hashedCode, verifyCodeExpiry: expiry, verifyAttempts: 0 },
    });

    await this.mail.sendVerificationEmail(dto.email, code);

    return genericResponse;
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const genericResponse = { message: 'If the email exists, a reset code has been sent.' };

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      return genericResponse;
    }

    const code = this.generateCode();
    const hashedCode = await bcrypt.hash(code, 10);
    const expiry = new Date(Date.now() + 15 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetCode: hashedCode, resetCodeExpiry: expiry, resetAttempts: 0 },
    });

    await this.mail.sendPasswordResetEmail(dto.email, code);

    return genericResponse;
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new BadRequestException('Invalid request');
    }

    if (!user.resetCode || !user.resetCodeExpiry) {
      throw new BadRequestException('Reset code expired or not found. Please request a new one.');
    }

    if (user.resetCodeExpiry < new Date()) {
      throw new BadRequestException('Reset code expired. Please request a new one.');
    }

    if (user.resetAttempts >= 5) {
      throw new BadRequestException('Too many failed attempts. Please request a new code.');
    }

    const codeValid = await bcrypt.compare(dto.code, user.resetCode);
    if (!codeValid) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { resetAttempts: { increment: 1 } },
      });
      throw new BadRequestException('Invalid reset code');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetCode: null,
        resetCodeExpiry: null,
        resetAttempts: 0,
        refreshToken: null,
      },
    });

    return { message: 'Password reset successfully' };
  }

  private generateCode(): string {
    return randomInt(100000, 999999).toString();
  }

  private async generateTokens(userId: string, email: string) {
    const payload = { sub: userId, email };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.getOrThrow('JWT_SECRET'),
        expiresIn: '15m',
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: '30d',
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async updateRefreshToken(userId: string, refreshToken: string) {
    const hashedToken = await bcrypt.hash(this.hashToken(refreshToken), 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: hashedToken },
    });
  }
}
