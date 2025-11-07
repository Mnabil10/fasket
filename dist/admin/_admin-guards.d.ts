import { CanActivate, ExecutionContext } from '@nestjs/common';
export declare const AdminOnly: () => <TFunction extends Function, Y>(target: TFunction | object, propertyKey?: string | symbol, descriptor?: TypedPropertyDescriptor<Y>) => void;
export declare const StaffOrAdmin: () => <TFunction extends Function, Y>(target: TFunction | object, propertyKey?: string | symbol, descriptor?: TypedPropertyDescriptor<Y>) => void;
export declare class AdminGuard implements CanActivate {
    canActivate(ctx: ExecutionContext): boolean;
}
