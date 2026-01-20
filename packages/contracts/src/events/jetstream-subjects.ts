import { EventNames } from './event-names';

/**
 * NATS subjects. Convention:
 *   outbib.<domain>.<entity>.<action>.v1
 */
export const JetStreamSubjects = {
  [EventNames.AuthUserRegisteredV1]: EventNames.AuthUserRegisteredV1,
  [EventNames.AuthUserRoleUpdatedV1]: EventNames.AuthUserRoleUpdatedV1,
  [EventNames.AuthUserDisabledV1]: EventNames.AuthUserDisabledV1,
} as const;
