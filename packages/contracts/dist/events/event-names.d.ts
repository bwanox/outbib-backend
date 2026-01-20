export declare const EventNames: {
    readonly AuthUserRegisteredV1: "outbib.auth.user.registered.v1";
    readonly AuthUserRoleUpdatedV1: "outbib.auth.user.role.updated.v1";
    readonly AuthUserDisabledV1: "outbib.auth.user.disabled.v1";
};
export type EventName = (typeof EventNames)[keyof typeof EventNames];
