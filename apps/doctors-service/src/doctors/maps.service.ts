import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { CreateDoctorDto } from './dto/create-doctor.dto';

@Injectable()
export class MapsService {
  private readonly logger = new Logger(MapsService.name);
  private readonly apiKey = this.configService.get<string>('GOOGLE_MAPS_API_KEY');

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async searchDoctors(query: string): Promise<CreateDoctorDto[]> {
    if (!this.apiKey) {
      this.logger.error('GOOGLE_MAPS_API_KEY is missing in .env');
      return [];
    }

    const fallbackCity = this.extractCityFromQuery(query);

    // Using Google Places Text Search API
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json`;
    
    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          params: {
            query: query, // e.g. "Cardiologist in Rabat"
            key: this.apiKey,
          },
        }),
      );

      if (response.data.status !== 'OK') {
        // --- THIS IS THE NEW LINE WE NEED ---
        this.logger.error(`Google Detailed Error: ${response.data.error_message}`);
        // ------------------------------------
        this.logger.warn(`Maps API Error: ${response.data.status}`);
        return [];
      }

      // Map the raw Google data to your strict Schema
      return response.data.results.map((place) => {
        const extractedCity = this.extractCity(place.formatted_address);
        const city = extractedCity === 'Unknown' && fallbackCity ? fallbackCity : extractedCity;

        return {
        googlePlaceId: place.place_id,
        name: place.name,
        address: place.formatted_address,
        city,
        latitude: place.geometry.location.lat,
        longitude: place.geometry.location.lng,
        // Optional fields
        rating: place.rating || 0,
        reviewCount: place.user_ratings_total || 0,
        openingHours: place.opening_hours || {}, 
      };
    });

    } catch (error) {
      this.logger.error('Failed to fetch from Maps', error);
      return [];
    }
  }

  // Simple helper to extract city from address string
  private extractCity(address: string): string {
    if (!address) return 'Unknown';
    if (address.includes('Rabat')) return 'Rabat';
    if (address.includes('Casablanca')) return 'Casablanca';
    if (address.includes('Marrakech')) return 'Marrakech';
    if (address.includes('Tangier')) return 'Tangier';
    return 'Unknown';
  }

  private extractCityFromQuery(query: string): string | null {
    if (!query) return null;
    const parts = query.split(' in ');
    if (parts.length < 2) return null;
    const city = parts[parts.length - 1]?.trim();
    return city ? city : null;
  }
}
