export class EventEnvelopeDto<TPayload = unknown> {
  /** Unique id for this event instance (uuid) */
  eventId!: string;

  /** Event name, e.g. outbib.auth.user.registered.v1 */
  eventName!: string;

  /** ISO timestamp */
  occurredAt!: string;

  /** Producer service name, e.g. auth-service */
  producer!: string;

  /** Optional tracing */
  correlationId?: string;

  payload!: TPayload;
}
