import { Global, Module } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { UserLoyaltyController } from './loyalty.controller';

@Global()
@Module({
  imports: [PrismaModule, SettingsModule],
  providers: [LoyaltyService],
  controllers: [UserLoyaltyController],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
