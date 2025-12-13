import { OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
export declare class PrismaService extends PrismaClient implements OnModuleInit {
    private readonly logger;
    private readonly statusGuard;
    onModuleInit(): Promise<void>;
    allowStatusUpdates<T>(runner: () => Promise<T>): Promise<T>;
}
