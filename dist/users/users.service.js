"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const bcrypt = require("bcrypt");
const prisma_service_1 = require("../prisma/prisma.service");
let UsersService = class UsersService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async me(userId) {
        const [user, ordersCount, sums] = await this.prisma.$transaction([
            this.prisma.user.findUnique({
                where: { id: userId },
                select: { id: true, name: true, phone: true, email: true, role: true, createdAt: true },
            }),
            this.prisma.order.count({ where: { userId } }),
            this.prisma.order.aggregate({ where: { userId }, _sum: { totalCents: true } }),
        ]);
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        const totalSpentCents = sums._sum.totalCents ?? 0;
        const points = Math.floor(totalSpentCents / 100);
        const loyaltyTier = points >= 5000 ? 'Platinum' : points >= 2500 ? 'Gold' : points >= 1000 ? 'Silver' : 'Bronze';
        return {
            ...user,
            ordersCount,
            totalSpentCents,
            points,
            loyaltyTier,
        };
    }
    async changePassword(userId, dto) {
        if (dto.currentPassword === dto.newPassword) {
            throw new common_1.BadRequestException('New password must be different from current password');
        }
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, password: true },
        });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        const matches = await bcrypt.compare(dto.currentPassword, user.password);
        if (!matches) {
            throw new common_1.BadRequestException('Current password is incorrect');
        }
        const hashed = await bcrypt.hash(dto.newPassword, 10);
        await this.prisma.user.update({ where: { id: userId }, data: { password: hashed } });
        return { ok: true };
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UsersService);
//# sourceMappingURL=users.service.js.map