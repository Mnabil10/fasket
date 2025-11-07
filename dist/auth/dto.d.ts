export declare class RegisterDto {
    name: string;
    phone: string;
    email?: string;
    password: string;
}
export declare class LoginDto {
    phone: string;
    password: string;
}
export declare class RefreshDto {
    refreshToken: string;
}
export declare class UpdateProfileDto {
    name?: string;
    password?: string;
}
