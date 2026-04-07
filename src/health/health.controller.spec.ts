import { Test, TestingModule } from '@nestjs/testing';
import {
  HealthCheckService,
  MemoryHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

const mockHealth = {
  check: jest.fn(),
};

const mockMemory = {
  checkHeap: jest.fn(),
};

const mockPrismaHealth = {
  pingCheck: jest.fn(),
};

const mockPrisma = {};

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: mockHealth },
        { provide: MemoryHealthIndicator, useValue: mockMemory },
        { provide: PrismaHealthIndicator, useValue: mockPrismaHealth },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  describe('check', () => {
    it('should return status ok when all indicators are healthy', async () => {
      const healthResult = {
        status: 'ok',
        info: { database: { status: 'up' }, memory_heap: { status: 'up' } },
        error: {},
        details: { database: { status: 'up' }, memory_heap: { status: 'up' } },
      };
      mockHealth.check.mockResolvedValue(healthResult);

      const result = await controller.check();

      expect(result.status).toBe('ok');
      expect(mockHealth.check).toHaveBeenCalledTimes(1);
    });

    it('should propagate the error when database check fails', async () => {
      const error = new Error('Database connection failed');
      mockHealth.check.mockRejectedValue(error);

      await expect(controller.check()).rejects.toThrow('Database connection failed');
    });
  });
});
