import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { connect, JSONCodec } from 'nats';
import { EventEnvelopeDto } from '@outbib/contracts';
import { v4 as uuidv4 } from 'uuid';

export const ReminderEventNames = {
  ReminderDueV1: 'outbib.reminders.reminder.due.v1',
} as const;

export type ReminderEventName = (typeof ReminderEventNames)[keyof typeof ReminderEventNames];

export type ReminderDueV1PayloadDto = {
  // Backward compatibility: historically used by this service.
  reminderId?: string;

  // Preferred identifier going forward.
  sourceId: string;

  userId: string;
  type: 'MEDICATION' | 'APPOINTMENT' | 'WATER_HABIT' | 'NOTE';
  title: string;
  scheduledFor: string; // ISO
  triggeredAt: string; // ISO
};

@Injectable()
export class ReminderEventsPublisher implements OnModuleInit {
  private readonly logger = new Logger(ReminderEventsPublisher.name);
  private ready = false;

  private codec = JSONCodec<EventEnvelopeDto<any>>();
  private nc: any;
  private js: any;
  private jsm: any;

  async onModuleInit() {
    const disabled = (process.env.NATS_DISABLED || 'false').toLowerCase() === 'true';
    if (disabled) {
      this.logger.warn('NATS_DISABLED=true; events publishing disabled');
      return;
    }

    const url = process.env.NATS_URL || 'nats://nats:4222';
    this.nc = await connect({ servers: url });
    this.js = this.nc.jetstream();
    this.jsm = await this.nc.jetstreamManager();

    // ensure stream
    try {
      await this.jsm.streams.info('OUTBIB_EVENTS');
    } catch {
      await this.jsm.streams.add({
        name: 'OUTBIB_EVENTS',
        subjects: ['outbib.>'],
        storage: 'file' as any,
      });
    }

    this.ready = true;
    this.logger.log('NATS publisher ready');
  }

  async publishReminderDue(payload: ReminderDueV1PayloadDto) {
    if (!this.ready) return;

    const env: EventEnvelopeDto<ReminderDueV1PayloadDto> = {
      eventId: uuidv4(),
      eventName: ReminderEventNames.ReminderDueV1,
      occurredAt: new Date().toISOString(),
      producer: 'reminders-service',
      payload,
    };

    await this.js.publish(ReminderEventNames.ReminderDueV1, this.codec.encode(env));
  }
}
