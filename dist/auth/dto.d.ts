export declare class RegisterDto {
    name: string;
    phone: string;
    email?: string;
    password: string;
}
export declare class LoginDto {
    identifier: string;
    phone?: string;
    email?: string;
    username?: string;
    login?: string;
    password: string;
    otp?: string;
}
export declare class RefreshDto {
    refreshToken?: string;
}
export declare class UpdateProfileDto {
    name?: string;
    password?: string;
}
export declare class VerifyTwoFaDto {
    otp: string;
}
