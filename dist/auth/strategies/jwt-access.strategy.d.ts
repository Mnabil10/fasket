import { Strategy } from 'passport-jwt';
import { CurrentUserPayload } from '../../common/types/current-user.type';
import { ConfigService } from '@nestjs/config';
declare const JwtAccessStrategy_base: new (...args: any[]) => Strategy;
export declare class JwtAccessStrategy extends JwtAccessStrategy_base {
    constructor(config: ConfigService);
    validate(payload: {
        sub: string;
        role: string;
        phone: string;
        email?: string | null;
        twoFaVerified?: boolean;
    }): Promise<CurrentUserPayload>;
}
export {};
