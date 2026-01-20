import { UserRole, UserStatus } from './auth.types';
export declare class RegisterRequestDto {
    email: string;
    password: string;
}
export declare class LoginRequestDto {
    email: string;
    password: string;
}
export declare class AuthTokensDto {
    accessToken: string;
    refreshToken: string;
}
export declare class RefreshRequestDto {
    refreshToken: string;
}
export declare class LogoutRequestDto {
    refreshToken: string;
}
export declare class MeResponseDto {
    id: string;
    email: string;
    role: UserRole;
    status: UserStatus;
}
