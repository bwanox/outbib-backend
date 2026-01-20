import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  AuthUserDisabledV1PayloadDto,
  AuthUserRegisteredV1PayloadDto,
  AuthUserRoleUpdatedV1PayloadDto,
  EventEnvelopeDto,
  EventNames,
} from '@outbib/contracts';
import { getNatsConnection, jsonCodec } from './nats-connection';

@Injectable()
export class AuthEventsPublisher {
  private readonly logger = new Logger(AuthEventsPublisher.name);

  private shouldSkipPublishing(err: unknown) {
    return err instanceof Error && err.message === 'NATS_DISABLED';
  }

  async publishUserRegistered(payload: AuthUserRegisteredV1PayloadDto, correlationId?: string) {
    try {
      const nc = await getNatsConnection();

      const event: EventEnvelopeDto<AuthUserRegisteredV1PayloadDto> = {
        eventId: uuidv4(),
        eventName: EventNames.AuthUserRegisteredV1,
        occurredAt: new Date().toISOString(),
        producer: 'auth-service',
        correlationId,
        payload,
      };

      nc.publish(EventNames.AuthUserRegisteredV1, jsonCodec.encode(event));
      this.logger.log(`Published ${event.eventName} for userId=${payload.userId}`);
    } catch (err) {
      if (this.shouldSkipPublishing(err)) return;
      this.logger.error('Failed to publish AuthUserRegisteredV1 event', err instanceof Error ? err.stack : String(err));
    }
  }

  async publishUserRoleUpdated(payload: AuthUserRoleUpdatedV1PayloadDto, correlationId?: string) {
    try {
      const nc = await getNatsConnection();

      const event: EventEnvelopeDto<AuthUserRoleUpdatedV1PayloadDto> = {
        eventId: uuidv4(),
        eventName: EventNames.AuthUserRoleUpdatedV1,
        occurredAt: new Date().toISOString(),
        producer: 'auth-service',
        correlationId,
        payload,
      };

      nc.publish(EventNames.AuthUserRoleUpdatedV1, jsonCodec.encode(event));
      this.logger.log(`Published ${event.eventName} for userId=${payload.userId}`);
    } catch (err) {
      if (this.shouldSkipPublishing(err)) return;
      this.logger.error('Failed to publish AuthUserRoleUpdatedV1 event', err instanceof Error ? err.stack : String(err));
    }
  }

  async publishUserDisabled(payload: AuthUserDisabledV1PayloadDto, correlationId?: string) {
    try {
      const nc = await getNatsConnection();

      const event: EventEnvelopeDto<AuthUserDisabledV1PayloadDto> = {
        eventId: uuidv4(),
        eventName: EventNames.AuthUserDisabledV1,
        occurredAt: new Date().toISOString(),
        producer: 'auth-service',
        correlationId,
        payload,
      };

      nc.publish(EventNames.AuthUserDisabledV1, jsonCodec.encode(event));
      this.logger.log(`Published ${event.eventName} for userId=${payload.userId}`);
    } catch (err) {
      if (this.shouldSkipPublishing(err)) return;
      this.logger.error('Failed to publish AuthUserDisabledV1 event', err instanceof Error ? err.stack : String(err));
    }
  }
}
