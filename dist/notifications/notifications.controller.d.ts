import { NotificationsService } from './notifications.service';
import { RegisterDeviceDto, UnregisterDeviceDto } from './dto';
import { CurrentUserPayload } from '../common/types/current-user.type';
export declare class NotificationsController {
    private readonly notifications;
    constructor(notifications: NotificationsService);
    registerDevice(user: CurrentUserPayload, dto: RegisterDeviceDto): Promise<{
        success: boolean;
        deviceId: string;
    }>;
    unregisterDevice(user: CurrentUserPayload, dto: UnregisterDeviceDto): Promise<{
        success: boolean;
    }>;
}
