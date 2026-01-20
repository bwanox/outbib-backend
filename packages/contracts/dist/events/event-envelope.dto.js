"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventEnvelopeDto = void 0;
class EventEnvelopeDto {
    /** Unique id for this event instance (uuid) */
    eventId;
    /** Event name, e.g. outbib.auth.user.registered.v1 */
    eventName;
    /** ISO timestamp */
    occurredAt;
    /** Producer service name, e.g. auth-service */
    producer;
    /** Optional tracing */
    correlationId;
    payload;
}
exports.EventEnvelopeDto = EventEnvelopeDto;
