import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ERROR_CODES } from './common/docs/error-codes';

@ApiTags('System')
@Controller({ path: 'system', version: ['1', '2'] })
export class AppController {
  @Get('health')
  @ApiOkResponse({
    description: 'Healthcheck payload',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  })
  ping() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('error-codes')
  @ApiOkResponse({
    description: 'List of shared API error codes',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          message: { type: 'string' },
        },
      },
    },
  })
  errorCodes() {
    return ERROR_CODES;
  }
}
