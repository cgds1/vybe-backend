import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  profile: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

const baseUser = {
  id: 'user-id-1',
  email: 'test@test.com',
  password: 'hashed-password',
  refreshToken: 'hashed-rt',
  createdAt: new Date(),
  updatedAt: new Date(),
  profile: {
    id: 'profile-id-1',
    userId: 'user-id-1',
    displayName: 'Test User',
    bio: null,
    avatarUrl: null,
  },
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('getMyProfile', () => {
    it('should return user with profile without password or refreshToken', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);

      const result = await service.getMyProfile('user-id-1');

      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('refreshToken');
      expect(result.email).toBe('test@test.com');
      expect(result.profile).toBeDefined();
    });
  });

  describe('updateUser', () => {
    it('should call prisma.user.update with the correct data', async () => {
      const dto = { email: 'new@test.com' };
      const updatedUser = { ...baseUser, email: 'new@test.com' };

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.update.mockResolvedValue(updatedUser);

      await service.updateUser('user-id-1', dto);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id-1' },
        data: dto,
      });
    });
  });

  describe('changePassword', () => {
    it('should throw UnauthorizedException when current password is incorrect', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changePassword('user-id-1', {
          currentPassword: 'wrong-password',
          newPassword: 'new-password',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should hash the new password and update when current password is correct', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-password');
      mockPrisma.user.update.mockResolvedValue(baseUser);

      const result = await service.changePassword('user-id-1', {
        currentPassword: 'correct-password',
        newPassword: 'new-password',
      });

      expect(bcrypt.hash).toHaveBeenCalledWith('new-password', 10);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id-1' },
        data: { password: 'new-hashed-password' },
      });
      expect(result).toEqual({ message: 'Password updated successfully' });
    });
  });
});
