import { connect, JSONCodec, NatsConnection } from 'nats';

let nc: NatsConnection | undefined;

export async function getNatsConnection(): Promise<NatsConnection> {
  if (nc) return nc;

  // Allow running locally without NATS.
  // Set NATS_DISABLED=true to skip connecting/publishing.
  if ((process.env.NATS_DISABLED || '').toLowerCase() === 'true') {
    throw new Error('NATS_DISABLED');
  }

  const url = process.env.NATS_URL || 'nats://nats:4222';
  nc = await connect({ servers: url });
  return nc;
}

export const jsonCodec = JSONCodec();
