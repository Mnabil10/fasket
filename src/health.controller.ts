import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('System')
@Controller({ path: '', version: ['1','2'] })
export class HealthController {
  @Get('health')
  @ApiOkResponse({ description: 'OK' })
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
