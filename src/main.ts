import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
// Use CommonJS require for compression to avoid default interop issues
// eslint-disable-next-line @typescript-eslint/no-var-requires
const compression = require('compression');
// Serve local uploads when using local driver
// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require('express');
import * as path from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const prefix = process.env.API_PREFIX || 'api/v1';
  app.setGlobalPrefix(prefix);
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));
  app.use(
  helmet({
    // We'll set these in Nginx
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    // keep your other helmet defaults
  })
);
  app.use(compression());
  // Static files for local uploads (e.g., when UPLOADS_DRIVER=local)
  const uploadsDir = process.env.UPLOADS_DIR || 'uploads';
  app.use('/uploads', express.static(path.resolve(process.cwd(), uploadsDir)));

  const config = new DocumentBuilder()
    .setTitle('Fasket API')
    .setDescription('Grocery e-commerce API')
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header', name: 'Authorization' },
      'bearer',
    )
    
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  app.enableCors({
    origin: [/^https?:\/\/localhost:\d+$/],
    credentials: true,
  });

  await app.listen(process.env.PORT ? Number(process.env.PORT) : 4000);
}
bootstrap();
