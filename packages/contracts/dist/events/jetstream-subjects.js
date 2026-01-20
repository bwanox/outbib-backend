"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JetStreamSubjects = void 0;
const event_names_1 = require("./event-names");
/**
 * NATS subjects. Convention:
 *   outbib.<domain>.<entity>.<action>.v1
 */
exports.JetStreamSubjects = {
    [event_names_1.EventNames.AuthUserRegisteredV1]: event_names_1.EventNames.AuthUserRegisteredV1,
    [event_names_1.EventNames.AuthUserRoleUpdatedV1]: event_names_1.EventNames.AuthUserRoleUpdatedV1,
    [event_names_1.EventNames.AuthUserDisabledV1]: event_names_1.EventNames.AuthUserDisabledV1,
};
