import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, RegisterDto, VerifyTwoFaDto } from './dto';
export declare class AuthController {
    private service;
    constructor(service: AuthService);
    register(dto: RegisterDto): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            email: string | null;
            phone: string;
            role: import(".prisma/client").$Enums.UserRole;
            name: string;
        };
    }>;
    login(dto: LoginDto, req: Request): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            name: string;
            phone: string;
            email: string | null;
            role: import(".prisma/client").$Enums.UserRole;
        };
    }>;
    refresh(req: any, _dto: RefreshDto): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
    setupAdminTwoFa(req: any): Promise<{
        secret: string;
        secretBase32: string;
        otpauthUrl: string;
    }>;
    enableAdminTwoFa(req: any, dto: VerifyTwoFaDto): Promise<{
        enabled: boolean;
    }>;
    disableAdminTwoFa(req: any): Promise<{
        enabled: boolean;
    }>;
}
