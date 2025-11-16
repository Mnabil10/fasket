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
exports.SlugService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const slug_util_1 = require("../utils/slug.util");
let SlugService = class SlugService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async generateUniqueSlug(model, base, excludeId) {
        let slug = (0, slug_util_1.slugify)(base);
        if (!slug) {
            throw new Error('Unable to generate slug');
        }
        let counter = 1;
        while (await this.exists(model, slug, excludeId)) {
            slug = `${(0, slug_util_1.slugify)(base)}-${counter++}`;
        }
        return slug;
    }
    async exists(model, slug, excludeId) {
        const where = { slug };
        if (excludeId) {
            where.NOT = { id: excludeId };
        }
        const entity = await this.prisma[model].findFirst({ where });
        return !!entity;
    }
};
exports.SlugService = SlugService;
exports.SlugService = SlugService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SlugService);
//# sourceMappingURL=slug.service.js.map