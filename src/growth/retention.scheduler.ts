import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GrowthService } from './growth.service';

@Injectable()
export class RetentionScheduler {
  private readonly logger = new Logger(RetentionScheduler.name);
  private running = false;

  constructor(private readonly growth: GrowthService) {}

  @Cron(CronExpression.EVERY_6_HOURS)
  async handleRetention() {
    if (this.running) return;
    this.running = true;
    try {
      await this.growth.runRetentionCycle();
    } catch (error) {
      this.logger.warn({ msg: 'Retention cycle failed', error: (error as Error).message });
    } finally {
      this.running = false;
    }
  }
}
