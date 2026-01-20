export class AuthUserRoleUpdatedV1PayloadDto {
  userId!: string;
  role!: 'user' | 'admin';
}

export {};
