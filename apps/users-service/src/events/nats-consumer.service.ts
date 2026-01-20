import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { connect, JSONCodec } from 'nats';
import {
  AuthUserDisabledV1PayloadDto,
  AuthUserRegisteredV1PayloadDto,
  AuthUserRoleUpdatedV1PayloadDto,
  EventEnvelopeDto,
  EventNames,
} from '@outbib/contracts';
import { UsersService } from '../users/users.service';

@Injectable()
export class NatsConsumerService implements OnModuleInit {
  private readonly logger = new Logger(NatsConsumerService.name);

  constructor(private readonly usersService: UsersService) {}

  async onModuleInit() {
    const disabled = (process.env.NATS_DISABLED || 'false').toLowerCase() === 'true';
    if (disabled) {
      this.logger.warn('NATS_DISABLED=true; skipping NATS subscriptions');
      return;
    }

    const url = process.env.NATS_URL || 'nats://nats:4222';
    const nc = await connect({ servers: url });

    const js = nc.jetstream();
    const jsm = await nc.jetstreamManager();

    // Ensure a stream exists for Outbib events.
    try {
      await jsm.streams.info('OUTBIB_EVENTS');
    } catch {
      await jsm.streams.add({
        name: 'OUTBIB_EVENTS',
        subjects: ['outbib.>'],
        storage: 'file' as any,
      });
    }

    const codec = JSONCodec();

    const ensureConsumer = async (consumerName: string, subject: string) => {
      try {
        await jsm.consumers.info('OUTBIB_EVENTS', consumerName);
      } catch {
        await jsm.consumers.add('OUTBIB_EVENTS', {
          durable_name: consumerName,
          ack_policy: 'explicit',
          filter_subject: subject,
        } as any);
      }

      const sub = await js.pullSubscribe(subject, {
        config: { durable_name: consumerName, ack_policy: 'explicit' } as any,
      });

      // Pull loop
      (async () => {
        for await (const m of sub) {
          try {
            const env = codec.decode(m.data) as EventEnvelopeDto<any>;
            await this.dispatch(subject, env);
            m.ack();
          } catch (e) {
            this.logger.error(`Failed to process event ${subject}, leaving unacked`, e as any);
          }
        }
      })();

      // Start pulling batches
      setInterval(() => {
        sub.pull({ batch: 10, expires: 1000 });
      }, 1000);

      this.logger.log(`Subscribed to ${subject}`);
    };

    await ensureConsumer('users-service-auth-user-registered-v1', EventNames.AuthUserRegisteredV1);
    await ensureConsumer('users-service-auth-user-role-updated-v1', EventNames.AuthUserRoleUpdatedV1);
    await ensureConsumer('users-service-auth-user-disabled-v1', EventNames.AuthUserDisabledV1);
  }

  private async dispatch(subject: string, env: EventEnvelopeDto<any>) {
    switch (subject) {
      case EventNames.AuthUserRegisteredV1:
        return this.handleUserRegistered(env as EventEnvelopeDto<AuthUserRegisteredV1PayloadDto>);
      case EventNames.AuthUserRoleUpdatedV1:
        return this.handleUserRoleUpdated(env as EventEnvelopeDto<AuthUserRoleUpdatedV1PayloadDto>);
      case EventNames.AuthUserDisabledV1:
        return this.handleUserDisabled(env as EventEnvelopeDto<AuthUserDisabledV1PayloadDto>);
      default:
        this.logger.warn(`Unhandled subject: ${subject}`);
    }
  }

  private async handleUserRegistered(env: EventEnvelopeDto<AuthUserRegisteredV1PayloadDto>) {
    const { userId, email, role, status } = env.payload as any;
    await this.usersService.upsertProfile(userId, email, { role, status });
    this.logger.log(`Profile ensured for userId=${userId}`);
  }

  private async handleUserRoleUpdated(env: EventEnvelopeDto<AuthUserRoleUpdatedV1PayloadDto>) {
    const { userId, role } = env.payload;
    await this.usersService.setAccountMetadata(userId, { role });
    this.logger.log(`Role mirrored for userId=${userId} role=${role}`);
  }

  private async handleUserDisabled(env: EventEnvelopeDto<AuthUserDisabledV1PayloadDto>) {
    const { userId, status } = env.payload as any;
    await this.usersService.setAccountMetadata(userId, { status: status ?? 'disabled' });
    this.logger.log(`Status mirrored for userId=${userId}`);
  }
}
