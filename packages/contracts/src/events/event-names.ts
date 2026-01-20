export const EventNames = {
  AuthUserRegisteredV1: 'outbib.auth.user.registered.v1',
  AuthUserRoleUpdatedV1: 'outbib.auth.user.role.updated.v1',
  AuthUserDisabledV1: 'outbib.auth.user.disabled.v1',
} as const;

export type EventName = (typeof EventNames)[keyof typeof EventNames];
