import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface GooglePlaceSearchResult {
  place_id: string;
  name: string;
  formatted_address?: string;
  geometry?: { location?: { lat: number; lng: number } };
  types?: string[];
}

interface GooglePlaceReview {
  author_name?: string;
  rating?: number;
  text?: string;
  relative_time_description?: string;
  time?: number;
}

interface GooglePlaceDetailsResult {
  place_id: string;
  name: string;
  formatted_address?: string;
  geometry?: { location?: { lat: number; lng: number } };
  formatted_phone_number?: string;
  international_phone_number?: string;
  website?: string;
  rating?: number;
  user_ratings_total?: number;
  opening_hours?: {
    open_now?: boolean;
    weekday_text?: string[];
    periods?: Array<Record<string, any>>;
  };
  types?: string[];
  reviews?: GooglePlaceReview[];
  address_components?: Array<{
    long_name: string;
    short_name: string;
    types: string[];
  }>;
}

export interface PharmacyMapsResult {
  placeId: string;
  name: string;
  address?: string;
  city?: string;
  country?: string;
  lat?: number;
  lng?: number;
  phone?: string | null;
  website?: string | null;
  rating?: number | null;
  ratingsCount?: number | null;
  openingHoursJson?: Record<string, any> | null;
  isOpenNow?: boolean | null;
  types?: string[];
  reviews?: Array<{
    authorName?: string | null;
    rating?: number | null;
    text?: string | null;
    relativeTimeDescription?: string | null;
    time?: Date | null;
  }>;
}

@Injectable()
export class GooglePlacesProvider {
  private readonly logger = new Logger(GooglePlacesProvider.name);
  private readonly apiBase = 'https://maps.googleapis.com/maps/api/place';

  constructor(private readonly configService: ConfigService) {}

  async fetchCityPharmacies(city: string, country?: string) {
    const apiKey = this.requireApiKey();
    const query = country ? `pharmacy in ${city}, ${country}` : `pharmacy in ${city}`;

    const results: GooglePlaceSearchResult[] = [];
    let pageToken: string | undefined;

    for (let page = 0; page < 3; page += 1) {
      const params: Record<string, string> = { query, key: apiKey };
      if (pageToken) params.pagetoken = pageToken;

      const response = await axios.get(`${this.apiBase}/textsearch/json`, { params });
      const data = response.data;
      if (data?.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        this.logger.warn(`Places textsearch status ${data.status}`);
      }

      if (Array.isArray(data?.results)) {
        results.push(...data.results);
      }

      pageToken = data?.next_page_token;
      if (!pageToken) break;

      await this.sleep(2000);
    }

    const placeIds = [...new Set(results.map((r) => r.place_id).filter(Boolean))];
    const concurrency = this.getConcurrency();
    const details = await this.mapWithConcurrency(placeIds, concurrency, (placeId) =>
      this.fetchDetails(placeId, apiKey),
    );

    const fallbackById = new Map(results.map((r) => [r.place_id, r]));
    const mapped = details
      .map((detail) => this.mapToPharmacy(detail, fallbackById.get(detail.place_id), city, country))
      .filter((item) => item.placeId && item.name);

    return {
      items: mapped,
      fetchedCount: mapped.length,
    };
  }

  private async fetchDetails(placeId: string, apiKey: string): Promise<GooglePlaceDetailsResult> {
    const params = {
      place_id: placeId,
      key: apiKey,
      fields:
        'place_id,name,formatted_address,geometry,formatted_phone_number,international_phone_number,website,rating,user_ratings_total,opening_hours,types,reviews,address_components',
    };

    const response = await axios.get(`${this.apiBase}/details/json`, { params });
    const data = response.data;
    if (data?.status && data.status !== 'OK') {
      this.logger.warn(`Places details status ${data.status} for ${placeId}`);
    }
    return data?.result ?? { place_id: placeId, name: '' };
  }

  private mapToPharmacy(
    detail: GooglePlaceDetailsResult,
    fallback: GooglePlaceSearchResult | undefined,
    defaultCity: string,
    defaultCountry?: string,
  ): PharmacyMapsResult {
    const addressComponents = detail.address_components ?? [];
    const city =
      this.pickAddressComponent(addressComponents, 'locality') ||
      this.pickAddressComponent(addressComponents, 'administrative_area_level_1') ||
      defaultCity;
    const country = this.pickAddressComponent(addressComponents, 'country') || defaultCountry;
    const location = detail.geometry?.location ?? fallback?.geometry?.location;

    const reviews = (detail.reviews ?? []).map((review) => ({
      authorName: review.author_name ?? null,
      rating: review.rating ?? null,
      text: review.text ?? null,
      relativeTimeDescription: review.relative_time_description ?? null,
      time: review.time ? new Date(review.time * 1000) : null,
    }));

    return {
      placeId: detail.place_id,
      name: detail.name || fallback?.name || '',
      address: detail.formatted_address || fallback?.formatted_address,
      city,
      country,
      lat: location?.lat,
      lng: location?.lng,
      phone: detail.formatted_phone_number || detail.international_phone_number || null,
      website: detail.website || null,
      rating: detail.rating ?? null,
      ratingsCount: detail.user_ratings_total ?? null,
      openingHoursJson: detail.opening_hours ?? null,
      isOpenNow: detail.opening_hours?.open_now ?? null,
      types: detail.types ?? fallback?.types ?? [],
      reviews,
    };
  }

  private pickAddressComponent(components: GooglePlaceDetailsResult['address_components'], type: string) {
    const match = components?.find((component) => component.types.includes(type));
    return match?.long_name;
  }

  private requireApiKey() {
    const apiKey = this.configService.get<string>('GOOGLE_MAPS_API_KEY');
    if (!apiKey) {
      throw new Error('GOOGLE_MAPS_API_KEY is not configured');
    }
    return apiKey;
  }

  private getConcurrency() {
    const raw = this.configService.get<string>('SYNC_CONCURRENCY');
    const parsed = raw ? Number(raw) : 3;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
  }

  private async mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>) {
    const results: R[] = [];
    let index = 0;

    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (true) {
        const current = index;
        index += 1;
        if (current >= items.length) break;
        results[current] = await mapper(items[current]);
      }
    });

    await Promise.all(workers);
    return results;
  }

  private async sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
