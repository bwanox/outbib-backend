import { PharmaciesService } from './pharmacies.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { GooglePlacesProvider } from './providers/google-places.provider';
import { ConfigService } from '@nestjs/config';

const createRedisMock = () => ({
  get: jest.fn(),
  set: jest.fn(),
  keys: jest.fn(),
  del: jest.fn(),
});

describe('PharmaciesService cache behavior', () => {
  it('returns cached list when available', async () => {
    const prisma = {
      pharmacy: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
    } as unknown as PrismaService;

    const redis = createRedisMock();
    redis.get.mockResolvedValue(JSON.stringify({ items: [], total: 0, page: 1, limit: 20 }));

    const redisService = { redis } as unknown as RedisService;
    const mapsProvider = {} as GooglePlacesProvider;
    const configService = { get: jest.fn() } as unknown as ConfigService;

    const service = new PharmaciesService(prisma, redisService, mapsProvider, configService);

    const result = await service.list({ city: 'Rabat' });

    expect(result.total).toBe(0);
    expect(prisma.pharmacy.count).not.toHaveBeenCalled();
  });

  it('writes list cache on miss', async () => {
    const prisma = {
      pharmacy: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([{ id: '1', name: 'Pharmacy' }]),
      },
    } as unknown as PrismaService;

    const redis = createRedisMock();
    redis.get.mockResolvedValue(null);

    const redisService = { redis } as unknown as RedisService;
    const mapsProvider = {} as GooglePlacesProvider;
    const configService = { get: jest.fn() } as unknown as ConfigService;

    const service = new PharmaciesService(prisma, redisService, mapsProvider, configService);

    const result = await service.list({ city: 'Rabat' });

    expect(result.total).toBe(1);
    expect(redis.set).toHaveBeenCalled();
  });
});
