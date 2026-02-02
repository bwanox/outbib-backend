import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { GetPharmaciesQueryDto } from './dto/get-pharmacies.query';
import { GetNearbyQueryDto } from './dto/get-nearby.query';
import { SyncPharmaciesDto } from './dto/sync-pharmacies.dto';
import { GooglePlacesProvider } from './providers/google-places.provider';

const LIST_TTL_SEC = 60 * 60; // 1h
const DETAIL_TTL_SEC = 60 * 60 * 24; // 24h
const PHARMACY_SOURCE_GOOGLE = 'GOOGLE_MAPS';
const SYNC_STATUS = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const;

@Injectable()
export class PharmaciesService {
  private readonly logger = new Logger(PharmaciesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly mapsProvider: GooglePlacesProvider,
    private readonly configService: ConfigService,
  ) {}

  async list(query: GetPharmaciesQueryDto) {
    const city = query.city?.trim();
    if (!city) throw new BadRequestException('city is required');

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const q = query.q?.trim();
    const minRating = query.minRating;

    const cacheKey = this.buildListCacheKey({ city, page, limit, q, minRating });
    const cached = await this.getCache(cacheKey);
    if (cached) return cached;

    const where: Record<string, any> = { city: { equals: city, mode: 'insensitive' } };
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { address: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (minRating !== undefined) {
      where.rating = { gte: minRating };
    }

    const [total, items] = await Promise.all([
      this.prisma.pharmacy.count({ where }),
      this.prisma.pharmacy.findMany({
        where,
        orderBy: { rating: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const autoSyncEnabled = this.getBoolEnv('PHARMACIES_AUTO_SYNC_ON_MISS', true);
    const canAutoSync =
      autoSyncEnabled &&
      total === 0 &&
      !q &&
      minRating === undefined &&
      page === 1;

    if (canAutoSync) {
      try {
        const country = this.configService.get<string>('MAPS_DEFAULT_COUNTRY');
        const syncResult = await this.mapsProvider.fetchCityPharmacies(city, country);
        const now = new Date();

        for (const item of syncResult.items) {
          if (!item.placeId || !item.name || item.lat === undefined || item.lng === undefined) continue;
          await this.prisma.pharmacy.upsert({
            where: { placeId: item.placeId },
            create: {
              placeId: item.placeId,
              name: item.name,
              address: item.address ?? '',
              city: item.city ?? city,
              country: item.country ?? country ?? '',
              lat: item.lat,
              lng: item.lng,
              phone: item.phone ?? null,
              website: item.website ?? null,
              rating: item.rating ?? null,
              ratingsCount: item.ratingsCount ?? null,
              openingHoursJson: item.openingHoursJson ?? undefined,
              isOpenNow: item.isOpenNow ?? null,
              types: item.types ?? [],
              source: PHARMACY_SOURCE_GOOGLE as any,
              lastSyncedAt: now,
            },
            update: {
              name: item.name,
              address: item.address ?? '',
              city: item.city ?? city,
              country: item.country ?? country ?? '',
              lat: item.lat,
              lng: item.lng,
              phone: item.phone ?? null,
              website: item.website ?? null,
              rating: item.rating ?? null,
              ratingsCount: item.ratingsCount ?? null,
              openingHoursJson: item.openingHoursJson ?? undefined,
              isOpenNow: item.isOpenNow ?? null,
              types: item.types ?? [],
              source: PHARMACY_SOURCE_GOOGLE as any,
              lastSyncedAt: now,
            },
          });
        }

        await this.invalidateCaches(city);

        const [freshTotal, freshItems] = await Promise.all([
          this.prisma.pharmacy.count({ where }),
          this.prisma.pharmacy.findMany({
            where,
            orderBy: { rating: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
          }),
        ]);

        const payload = { items: freshItems, total: freshTotal, page, limit };
        await this.setCache(cacheKey, payload, LIST_TTL_SEC);
        return payload;
      } catch (err) {
        this.logger.warn(`Auto-sync skipped or failed for city ${city}`);
      }
    }

    const payload = {
      items,
      total,
      page,
      limit,
    };

    await this.setCache(cacheKey, payload, LIST_TTL_SEC);
    return payload;
  }

  async nearby(query: GetNearbyQueryDto) {
    const radiusMeters = query.radiusMeters ?? 3000;
    const limit = query.limit ?? 30;

    const cacheKey = this.buildNearbyCacheKey({
      lat: query.lat,
      lng: query.lng,
      radiusMeters,
      limit,
    });
    const cached = await this.getCache(cacheKey);
    if (cached) return cached;

    const { minLat, maxLat, minLng, maxLng } = this.boundingBox(query.lat, query.lng, radiusMeters);
    const candidates = await this.prisma.pharmacy.findMany({
      where: {
        lat: { gte: minLat, lte: maxLat },
        lng: { gte: minLng, lte: maxLng },
      },
    });

    const enriched = candidates
      .map((pharmacy) => ({
        pharmacy,
        distanceMeters: this.distanceMeters(query.lat, query.lng, pharmacy.lat, pharmacy.lng),
      }))
      .filter((entry) => entry.distanceMeters <= radiusMeters)
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, limit);

    const payload = {
      items: enriched,
      count: enriched.length,
      radiusMeters,
    };

    await this.setCache(cacheKey, payload, LIST_TTL_SEC);
    return payload;
  }

  async getById(id: string) {
    const cacheKey = this.buildDetailCacheKey(id);
    const cached = await this.getCache(cacheKey);
    if (cached) return cached;

    const pharmacy = await this.prisma.pharmacy.findUnique({ where: { id } });
    if (!pharmacy) throw new NotFoundException('Pharmacy not found');

    await this.setCache(cacheKey, pharmacy, DETAIL_TTL_SEC);
    return pharmacy;
  }

  async getByPlaceId(placeId: string) {
    const cacheKey = this.buildDetailCacheKey(`place:${placeId}`);
    const cached = await this.getCache(cacheKey);
    if (cached) return cached;

    const pharmacy = await this.prisma.pharmacy.findUnique({ where: { placeId } });
    if (!pharmacy) throw new NotFoundException('Pharmacy not found');

    await this.setCache(cacheKey, pharmacy, DETAIL_TTL_SEC);
    return pharmacy;
  }

  async sync(dto: SyncPharmaciesDto) {
    const city = dto.city.trim();
    const country = dto.country?.trim() || this.configService.get<string>('MAPS_DEFAULT_COUNTRY');

    const job = await this.prisma.syncJob.create({
      data: {
        city,
        status: SYNC_STATUS.RUNNING as any,
        startedAt: new Date(),
      },
    });

    try {
      const result = await this.mapsProvider.fetchCityPharmacies(city, country);
      const now = new Date();
      let upserted = 0;

      for (const item of result.items) {
        if (!item.placeId || !item.name || item.lat === undefined || item.lng === undefined) {
          continue;
        }

        const pharmacy = await this.prisma.pharmacy.upsert({
          where: { placeId: item.placeId },
          create: {
            placeId: item.placeId,
            name: item.name,
            address: item.address ?? '',
            city: item.city ?? city,
            country: item.country ?? country ?? '',
            lat: item.lat,
            lng: item.lng,
            phone: item.phone ?? null,
            website: item.website ?? null,
            rating: item.rating ?? null,
            ratingsCount: item.ratingsCount ?? null,
            openingHoursJson: item.openingHoursJson ?? undefined,
            isOpenNow: item.isOpenNow ?? null,
            types: item.types ?? [],
            source: PHARMACY_SOURCE_GOOGLE as any,
            lastSyncedAt: now,
          },
          update: {
            name: item.name,
            address: item.address ?? '',
            city: item.city ?? city,
            country: item.country ?? country ?? '',
            lat: item.lat,
            lng: item.lng,
            phone: item.phone ?? null,
            website: item.website ?? null,
            rating: item.rating ?? null,
            ratingsCount: item.ratingsCount ?? null,
            openingHoursJson: item.openingHoursJson ?? undefined,
            isOpenNow: item.isOpenNow ?? null,
            types: item.types ?? [],
            source: PHARMACY_SOURCE_GOOGLE as any,
            lastSyncedAt: now,
          },
        });

        if (item.reviews?.length) {
          const data = item.reviews.map((review) => ({
            pharmacyId: pharmacy.id,
            authorName: review.authorName ?? null,
            rating: review.rating ?? null,
            text: review.text ?? null,
            relativeTimeDescription: review.relativeTimeDescription ?? null,
            time: review.time ?? null,
          }));

          await this.prisma.pharmacyReview.createMany({
            data,
            skipDuplicates: true,
          });
        }

        upserted += 1;
      }

      await this.prisma.syncJob.update({
        where: { id: job.id },
        data: {
          status: SYNC_STATUS.SUCCESS as any,
          finishedAt: new Date(),
          fetchedCount: result.fetchedCount,
          upsertedCount: upserted,
        },
      });

      await this.invalidateCaches(city);

      return {
        fetchedCount: result.fetchedCount,
        upsertedCount: upserted,
        city,
        jobId: job.id,
      };
    } catch (error: any) {
      this.logger.error('Sync failed', error?.stack || error);
      await this.prisma.syncJob.update({
        where: { id: job.id },
        data: {
          status: SYNC_STATUS.FAILED as any,
          finishedAt: new Date(),
          errorsJson: { message: error?.message ?? 'Unknown error' },
        },
      });
      throw error;
    }
  }

  async syncStatus(city: string) {
    if (!city) throw new BadRequestException('city is required');

    const job = await this.prisma.syncJob.findFirst({
      where: { city: { equals: city, mode: 'insensitive' } },
      orderBy: { startedAt: 'desc' },
    });

    if (!job) return { city, status: 'NONE' };
    return job;
  }

  private buildListCacheKey(params: {
    city: string;
    page: number;
    limit: number;
    q?: string;
    minRating?: number;
  }) {
    const q = params.q ? params.q.toLowerCase() : '';
    const minRating = params.minRating ?? '';
    return `pharmacies:list:${params.city.toLowerCase()}:${params.page}:${params.limit}:${q}:${minRating}`;
  }

  private buildNearbyCacheKey(params: {
    lat: number;
    lng: number;
    radiusMeters: number;
    limit: number;
  }) {
    const lat = params.lat.toFixed(3);
    const lng = params.lng.toFixed(3);
    return `pharmacies:nearby:${lat}:${lng}:${params.radiusMeters}:${params.limit}`;
  }

  private buildDetailCacheKey(id: string) {
    return `pharmacies:detail:${id}`;
  }

  private async getCache<T>(key: string): Promise<T | null> {
    const redis = this.redisService.redis;
    if (!redis) return null;
    const cached = await redis.get(key);
    return cached ? (JSON.parse(cached) as T) : null;
  }

  private async setCache(key: string, payload: unknown, ttlSeconds: number) {
    const redis = this.redisService.redis;
    if (!redis) return;
    await redis.set(key, JSON.stringify(payload), 'EX', ttlSeconds);
  }

  private async invalidateCaches(city: string) {
    const redis = this.redisService.redis;
    if (!redis) return;
    const normalized = city.toLowerCase();
    const keys = await redis.keys(`pharmacies:*:${normalized}*`);
    if (keys.length) {
      await redis.del(keys);
    }
  }

  private getBoolEnv(name: string, fallback: boolean) {
    const raw = this.configService.get<string>(name);
    if (raw == null || raw.trim() === '') return fallback;
    return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
  }

  private distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
    const radius = 6371000;
    const dLat = this.degToRad(lat2 - lat1);
    const dLng = this.degToRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.degToRad(lat1)) *
        Math.cos(this.degToRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return radius * c;
  }

  private degToRad(value: number) {
    return (value * Math.PI) / 180;
  }

  private boundingBox(lat: number, lng: number, radiusMeters: number) {
    const latDelta = radiusMeters / 111320;
    const lngDelta = radiusMeters / (111320 * Math.cos(this.degToRad(lat)));
    return {
      minLat: lat - latDelta,
      maxLat: lat + latDelta,
      minLng: lng - lngDelta,
      maxLng: lng + lngDelta,
    };
  }
}
