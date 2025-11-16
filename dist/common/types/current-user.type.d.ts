import { UserRole } from '@prisma/client';
export interface CurrentUserPayload {
    userId: string;
    role: UserRole;
    phone: string;
    email?: string;
}
