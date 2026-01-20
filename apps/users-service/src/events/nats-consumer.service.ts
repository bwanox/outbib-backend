import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { connect, JSONCodec } from 'nats';
import {
  AuthUserRegisteredV1PayloadDto,
  EventEnvelopeDto,
  EventNames,
} from '@outbib/contracts';
import { UsersService } from '../users/users.service';

@Injectable()
export class NatsConsumerService implements OnModuleInit {
  private readonly logger = new Logger(NatsConsumerService.name);

  async onModuleInit() {
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

    const consumerName = 'users-service-auth-user-registered-v1';

    // Ensure a durable consumer exists.
    try {
      await jsm.consumers.info('OUTBIB_EVENTS', consumerName);
    } catch {
      await jsm.consumers.add('OUTBIB_EVENTS', {
        durable_name: consumerName,
        ack_policy: 'explicit',
        filter_subject: EventNames.AuthUserRegisteredV1,
      } as any);
    }

    const codec = JSONCodec();
    const sub = await js.pullSubscribe(EventNames.AuthUserRegisteredV1, {
      config: { durable_name: consumerName, ack_policy: 'explicit' } as any,
    });

    // Pull loop
    (async () => {
      for await (const m of sub) {
        try {
          const env = codec.decode(m.data) as EventEnvelopeDto<AuthUserRegisteredV1PayloadDto>;
          await this.handleUserRegistered(env);
          m.ack();
        } catch (e) {
          this.logger.error('Failed to process event, leaving unacked', e as any);
        }
      }
    })();

    // Start pulling batches
    setInterval(() => {
      sub.pull({ batch: 10, expires: 1000 });
    }, 1000);

    this.logger.log(`Subscribed to ${EventNames.AuthUserRegisteredV1}`);
  }

  constructor(private readonly usersService: UsersService) {}

  private async handleUserRegistered(env: EventEnvelopeDto<AuthUserRegisteredV1PayloadDto>) {
    const { userId, email } = env.payload;
    await this.usersService.upsertProfile(userId, email, {});
    this.logger.log(`Profile ensured for userId=${userId}`);
  }
}
