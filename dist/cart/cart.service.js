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
exports.CartService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let CartService = class CartService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async ensureCart(userId) {
        let cart = await this.prisma.cart.findUnique({ where: { userId } });
        if (!cart)
            cart = await this.prisma.cart.create({ data: { userId } });
        return cart;
    }
    async get(userId) {
        const cart = await this.ensureCart(userId);
        const items = await this.prisma.cartItem.findMany({
            where: { cartId: cart.id },
            include: { product: { select: { name: true, imageUrl: true, salePriceCents: true, priceCents: true } } }
        });
        const subtotal = items.reduce((s, i) => s + i.priceCents * i.qty, 0);
        return { cartId: cart.id, items, subtotalCents: subtotal };
    }
    async add(userId, dto) {
        const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
        if (!product || product.status !== 'ACTIVE' || product.stock < dto.qty) {
            throw new common_1.BadRequestException('Product unavailable');
        }
        const cart = await this.ensureCart(userId);
        const price = product.salePriceCents ?? product.priceCents;
        return this.prisma.cartItem.upsert({
            where: { cartId_productId: { cartId: cart.id, productId: product.id } },
            update: { qty: { increment: dto.qty }, priceCents: price },
            create: { cartId: cart.id, productId: product.id, qty: dto.qty, priceCents: price },
        });
    }
    async updateQty(userId, id, qty) {
        const cart = await this.ensureCart(userId);
        const item = await this.prisma.cartItem.findFirst({ where: { id, cartId: cart.id }, include: { product: true } });
        if (!item)
            throw new common_1.BadRequestException('Item not found');
        if (qty > (item.product?.stock ?? 0))
            throw new common_1.BadRequestException('Insufficient stock');
        return this.prisma.cartItem.update({ where: { id }, data: { qty } });
    }
    async remove(userId, id) {
        const cart = await this.ensureCart(userId);
        await this.prisma.cartItem.deleteMany({ where: { id, cartId: cart.id } });
        return { ok: true };
    }
};
exports.CartService = CartService;
exports.CartService = CartService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CartService);
//# sourceMappingURL=cart.service.js.map