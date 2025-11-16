import { ExecutionContext } from '@nestjs/common';
import { RequestContextService } from '../context/request-context.service';
declare const JwtAuthGuard_base: import("@nestjs/passport").Type<import("@nestjs/passport").IAuthGuard>;
export declare class JwtAuthGuard extends JwtAuthGuard_base {
    private readonly context;
    constructor(context: RequestContextService);
    handleRequest(err: any, user: any, info: any, ctx: ExecutionContext): any;
}
export {};
