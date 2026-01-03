import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProviderController } from './provider.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ProviderController],
})
export class ProvidersModule {}
