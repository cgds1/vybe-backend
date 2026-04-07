import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
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

const baseUser = {
  id: 'user-id-1',
  email: 'test@test.com',
  password: 'hashed-password',
  refreshToken: 'hashed-refresh-token',
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
    });

    it('should throw ConflictException if email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);

      await expect(
        service.register({ email: 'test@test.com', password: 'pass' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should return tokens for valid credentials', async () => {
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
});
