import { HealthCheckService } from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
export declare class HealthController {
    private readonly health;
    private readonly prisma;
    private readonly config;
    constructor(health: HealthCheckService, prisma: PrismaService, config: ConfigService);
    private prismaCheck;
    private redisCheck;
    private queueCheck;
    healthcheck(): Promise<import("@nestjs/terminus").HealthCheckResult>;
}
