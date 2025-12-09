import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
declare const JwtRefreshStrategy_base: new (...args: any[]) => Strategy;
export declare class JwtRefreshStrategy extends JwtRefreshStrategy_base {
    constructor(config: ConfigService);
    validate(payload: {
        sub: string;
        jti?: string;
    }): Promise<{
        userId: string;
        jti: string | undefined;
    }>;
}
export {};
