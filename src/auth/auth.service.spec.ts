import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

const mockJwt = {
  signAsync: jest.fn(),
  verify: jest.fn(),
};

const mockConfig = {
  getOrThrow: jest.fn().mockReturnValue('test-secret'),
};

const mockMail = {
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
};

const baseUser = {
  id: 'user-id-1',
  email: 'test@test.com',
  password: 'hashed-password',
  refreshToken: 'hashed-refresh-token',
  isVerified: true,
  verifyCode: null,
  verifyCodeExpiry: null,
  verifyAttempts: 0,
  resetCode: null,
  resetCodeExpiry: null,
  resetAttempts: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: MailService, useValue: mockMail },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('should return accessToken, refreshToken, and user without password for a new user', async () => {
      const dto = { email: 'test@test.com', password: 'plainPassword' };

      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      mockPrisma.user.create.mockResolvedValue(baseUser);
      mockJwt.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');
      mockPrisma.user.update.mockResolvedValue(baseUser);

      const result = await service.register(dto);

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(result.user).not.toHaveProperty('password');
      expect(result.user).not.toHaveProperty('refreshToken');
      expect(result.user.email).toBe('test@test.com');
      expect(mockMail.sendVerificationEmail).toHaveBeenCalledWith('test@test.com', expect.any(String));
    });

    it('should throw ConflictException if email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);

      await expect(
        service.register({ email: 'test@test.com', password: 'pass' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should return tokens for valid verified credentials', async () => {
      const dto = { email: 'test@test.com', password: 'plainPassword' };

      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwt.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-rt');
      mockPrisma.user.update.mockResolvedValue(baseUser);

      const result = await service.login(dto);

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(result.user).not.toHaveProperty('password');
    });

    it('should throw UnauthorizedException if email does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@test.com', password: 'pass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if password is incorrect', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: 'test@test.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ForbiddenException if email is not verified', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, isVerified: false });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.login({ email: 'test@test.com', password: 'plainPassword' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('refreshTokens', () => {
    it('should return new tokens when token is valid and hash matches', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-id-1', email: 'test@test.com' });
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwt.signAsync
        .mockResolvedValueOnce('new-access-token')
        .mockResolvedValueOnce('new-refresh-token');
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-rt');
      mockPrisma.user.update.mockResolvedValue(baseUser);

      const result = await service.refreshTokens('valid-refresh-token');

      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
    });

    it('should throw UnauthorizedException if JWT is invalid', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('invalid signature');
      });

      await expect(service.refreshTokens('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('should call prisma.user.update with refreshToken: null', async () => {
      mockPrisma.user.update.mockResolvedValue(baseUser);

      await service.logout('user-id-1');

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id-1' },
        data: { refreshToken: null },
      });
    });
  });

  describe('verifyEmail', () => {
    const dto = { email: 'test@test.com', code: '482917' };
    const futureDate = new Date(Date.now() + 10 * 60 * 1000);

    it('should verify email successfully with correct code', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        isVerified: false,
        verifyCode: 'hashed-code',
        verifyCodeExpiry: futureDate,
        verifyAttempts: 0,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrisma.user.update.mockResolvedValue(baseUser);

      const result = await service.verifyEmail(dto);

      expect(result.message).toBe('Email verified successfully');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id-1' },
        data: { isVerified: true, verifyCode: null, verifyCodeExpiry: null, verifyAttempts: 0 },
      });
    });

    it('should throw BadRequestException if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.verifyEmail(dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if already verified', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, isVerified: true });

      await expect(service.verifyEmail(dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if code is expired', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        isVerified: false,
        verifyCode: 'hashed-code',
        verifyCodeExpiry: new Date(Date.now() - 1000),
        verifyAttempts: 0,
      });

      await expect(service.verifyEmail(dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException after 5 failed attempts', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        isVerified: false,
        verifyCode: 'hashed-code',
        verifyCodeExpiry: futureDate,
        verifyAttempts: 5,
      });

      await expect(service.verifyEmail(dto)).rejects.toThrow(BadRequestException);
    });

    it('should increment verifyAttempts on wrong code', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        isVerified: false,
        verifyCode: 'hashed-code',
        verifyCodeExpiry: futureDate,
        verifyAttempts: 2,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      mockPrisma.user.update.mockResolvedValue(baseUser);

      await expect(service.verifyEmail(dto)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id-1' },
        data: { verifyAttempts: { increment: 1 } },
      });
    });
  });

  describe('resendVerification', () => {
    const dto = { email: 'test@test.com' };
    const genericResponse = { message: 'If the email exists, a verification code has been sent.' };

    it('should send email and return generic response when user is unverified', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, isVerified: false });
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-code');
      mockPrisma.user.update.mockResolvedValue(baseUser);

      const result = await service.resendVerification(dto);

      expect(result).toEqual(genericResponse);
      expect(mockMail.sendVerificationEmail).toHaveBeenCalledWith('test@test.com', expect.any(String));
    });

    it('should return generic response without error when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.resendVerification(dto);

      expect(result).toEqual(genericResponse);
      expect(mockMail.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('should return generic response without error when user is already verified', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, isVerified: true });

      const result = await service.resendVerification(dto);

      expect(result).toEqual(genericResponse);
      expect(mockMail.sendVerificationEmail).not.toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    const dto = { email: 'test@test.com' };
    const genericResponse = { message: 'If the email exists, a reset code has been sent.' };

    it('should send reset email and return generic response when user exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-code');
      mockPrisma.user.update.mockResolvedValue(baseUser);

      const result = await service.forgotPassword(dto);

      expect(result).toEqual(genericResponse);
      expect(mockMail.sendPasswordResetEmail).toHaveBeenCalledWith('test@test.com', expect.any(String));
    });

    it('should return generic response without error when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.forgotPassword(dto);

      expect(result).toEqual(genericResponse);
      expect(mockMail.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    const dto = { email: 'test@test.com', code: '482917', newPassword: 'NewPass123' };
    const futureDate = new Date(Date.now() + 10 * 60 * 1000);

    it('should reset password and invalidate sessions on correct code', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        resetCode: 'hashed-code',
        resetCodeExpiry: futureDate,
        resetAttempts: 0,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-password');
      mockPrisma.user.update.mockResolvedValue(baseUser);

      const result = await service.resetPassword(dto);

      expect(result.message).toBe('Password reset successfully');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id-1' },
        data: {
          password: 'new-hashed-password',
          resetCode: null,
          resetCodeExpiry: null,
          resetAttempts: 0,
          refreshToken: null,
        },
      });
    });

    it('should throw BadRequestException if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.resetPassword(dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if reset code is expired', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        resetCode: 'hashed-code',
        resetCodeExpiry: new Date(Date.now() - 1000),
        resetAttempts: 0,
      });

      await expect(service.resetPassword(dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException after 5 failed attempts', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        resetCode: 'hashed-code',
        resetCodeExpiry: futureDate,
        resetAttempts: 5,
      });

      await expect(service.resetPassword(dto)).rejects.toThrow(BadRequestException);
    });

    it('should increment resetAttempts on wrong code', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        resetCode: 'hashed-code',
        resetCodeExpiry: futureDate,
        resetAttempts: 1,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      mockPrisma.user.update.mockResolvedValue(baseUser);

      await expect(service.resetPassword(dto)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id-1' },
        data: { resetAttempts: { increment: 1 } },
      });
    });
  });
});
