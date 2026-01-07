import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FinanceService } from './finance.service';
import { PayoutsService } from './payouts.service';
import { CommissionConfigService } from './commission-config.service';
import { AdminFinanceController } from './admin-finance.controller';
import { ProviderFinanceController } from './provider-finance.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AdminFinanceController, ProviderFinanceController],
  providers: [FinanceService, PayoutsService, CommissionConfigService],
  exports: [FinanceService, PayoutsService, CommissionConfigService],
})
export class FinanceModule {}
