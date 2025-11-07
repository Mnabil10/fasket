"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const swagger_1 = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const helmet_1 = require("helmet");
const compression = require('compression');
const express = require('express');
const path = require("path");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const prefix = process.env.API_PREFIX || 'api/v1';
    app.setGlobalPrefix(prefix);
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
    }));
    app.use((0, helmet_1.default)());
    app.use(compression());
    const uploadsDir = process.env.UPLOADS_DIR || 'uploads';
    app.use('/uploads', express.static(path.resolve(process.cwd(), uploadsDir)));
    const config = new swagger_1.DocumentBuilder()
        .setTitle('Fasket API')
        .setDescription('Grocery e-commerce API')
        .setVersion('1.0.0')
        .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header', name: 'Authorization' }, 'bearer')
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, config);
    swagger_1.SwaggerModule.setup('api/docs', app, document, {
        swaggerOptions: { persistAuthorization: true },
    });
    app.enableCors({
        origin: [/^https?:\/\/localhost:\d+$/],
        credentials: true,
    });
    await app.listen(process.env.PORT ? Number(process.env.PORT) : 4000);
}
bootstrap();
//# sourceMappingURL=main.js.map