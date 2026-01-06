import { Body, Controller, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CreateProviderApplicationDto } from './dto/provider-application.dto';
import { ProviderApplicationsService } from './provider-applications.service';

@ApiTags('ProviderApplications')
@Controller({ path: 'provider-applications', version: ['1'] })
export class ProviderApplicationsController {
  constructor(private readonly applications: ProviderApplicationsService) {}

  @Post()
  @ApiOkResponse({ description: 'Create provider application' })
  async create(@Body() dto: CreateProviderApplicationDto) {
    return this.applications.createApplication(dto);
  }
}
