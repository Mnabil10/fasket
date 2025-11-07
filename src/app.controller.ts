import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class AppController {
  @Get()
  ping() {
    return { ok: true, ts: new Date().toISOString() };
  }
}
