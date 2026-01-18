import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { NotificationsService } from './notifications.service';
import { RegisterDeviceDto, UnregisterDeviceDto } from './dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../common/types/current-user.type';

@ApiTags('Notifications')
@Controller({ path: 'notifications', version: ['1','2'] })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('register-device')
  registerDevice(@CurrentUser() user: CurrentUserPayload, @Body() dto: RegisterDeviceDto) {
    return this.notifications.registerDevice(user.userId, user.role, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('unregister-device')
  unregisterDevice(@CurrentUser() user: CurrentUserPayload, @Body() dto: UnregisterDeviceDto) {
    return this.notifications.unregisterDevice(user.userId, dto.token);
  }
}
