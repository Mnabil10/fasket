import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StaffOrAdmin } from '../admin/_admin-guards';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../common/types/current-user.type';
import { WhatsappBroadcastDto, WhatsappBroadcastTarget } from './dto/whatsapp-broadcast.dto';
import { WhatsappBroadcastService } from './whatsapp-broadcast.service';

@ApiTags('Admin/WhatsApp')
@ApiBearerAuth()
@StaffOrAdmin()
@Controller({ path: 'admin/whatsapp/broadcast', version: ['1'] })
export class WhatsappBroadcastController {
  constructor(private readonly broadcast: WhatsappBroadcastService) {}

  @Post()
  async send(@Body() dto: WhatsappBroadcastDto, @CurrentUser() user: CurrentUserPayload) {
    this.validate(dto);
    return this.broadcast.sendBroadcast(dto, user?.userId ?? null);
  }

  private validate(dto: WhatsappBroadcastDto) {
    if (
      dto.target === WhatsappBroadcastTarget.LAST_CUSTOMERS ||
      dto.target === WhatsappBroadcastTarget.LAST_ORDERS ||
      dto.target === WhatsappBroadcastTarget.RANDOM_CUSTOMERS
    ) {
      if (!dto.limit || dto.limit <= 0) {
        throw new BadRequestException('limit is required for the selected target');
      }
    }
    if (dto.target === WhatsappBroadcastTarget.PHONES && (!dto.phones || dto.phones.length === 0)) {
      throw new BadRequestException('phones are required for the selected target');
    }
  }
}
