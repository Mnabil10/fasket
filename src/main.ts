// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import * as path from 'path';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { randomUUID } from 'crypto';
import { Logger } from 'nestjs-pino';
import { Request, Response, NextFunction } from 'express';
import { SanitizeInputPipe } from './common/pipes/sanitize-input.pipe';
import { RequestContextService } from './common/context/request-context.service';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const compression = require('compression');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require('express');

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.2'),
    profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.2'),
    integrations: [nodeProfilingIntegration()],
    environment: process.env.NODE_ENV,
  });
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const configService = app.get(ConfigService);
  const logger = app.get(Logger);
  app.useLogger(logger);

  const context = app.get(RequestContextService);
  app.use((req: Request, res: Response, next: NextFunction) => {
    const correlationId =
      (req.headers['x-correlation-id'] as string | undefined) || randomUUID();
    req.headers['x-correlation-id'] = correlationId;
    res.setHeader('x-correlation-id', correlationId);
    context.run(
      () => {
        context.set('ip', req.ip);
        context.set('userAgent', req.headers['user-agent']);
        next();
      },
      { correlationId, ip: req.ip, userAgent: req.headers['user-agent'] },
    );
  });

  const rawPrefix = configService.get<string>('API_PREFIX') ?? 'api';
  const normalizedPrefix = rawPrefix.replace(/^\/+|\/+$/g, '');
  const sanitizedPrefix = normalizedPrefix.replace(/\/v\d+$/i, '');
  const finalPrefix = sanitizedPrefix || normalizedPrefix || 'api';
  if (sanitizedPrefix !== normalizedPrefix) {
    logger.warn(
      `API_PREFIX "${rawPrefix}" contained a version segment. Using "${finalPrefix}" and relying on Nest versioning.`,
    );
  }
  app.setGlobalPrefix(finalPrefix);
  const PREFIX_NORMALIZED_SYMBOL = Symbol('prefix-normalized');
  app.use((req: Request & { [PREFIX_NORMALIZED_SYMBOL]?: boolean }, _res: Response, next: NextFunction) => {
    if (!finalPrefix) return next();
    const hasPrefix = req.url === `/${finalPrefix}` || req.url.startsWith(`/${finalPrefix}/`);
    const versionAtRoot = /^\/v\d+(\/|$)/i.test(req.url);
    if (versionAtRoot && !hasPrefix) {
      const updated = `/${finalPrefix}${req.url}`;
      if (!req[PREFIX_NORMALIZED_SYMBOL]) {
        logger.debug(`Inserted missing API prefix: "${req.url}" -> "${updated}"`);
        req[PREFIX_NORMALIZED_SYMBOL] = true;
      }
      req.url = updated;
    }
    next();
  });
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const pattern = new RegExp(`^(/${finalPrefix}/v\\d+)/${finalPrefix}/v\\d+(\\/|$)`);
    if (pattern.test(req.url)) {
      const cleaned = req.url.replace(pattern, '$1$2');
      logger.warn(`Normalized duplicate API prefix: "${req.url}" -> "${cleaned}"`);
      req.url = cleaned;
    }
    next();
  });
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const originalUrl = req.url;
    const cleaned = originalUrl.replace(/\/(v\d+)\/\1(\/|$)/gi, '/$1$2');
    if (cleaned !== originalUrl) {
      logger.warn(`Normalized duplicate API version segments: "${originalUrl}" -> "${cleaned}"`);
      req.url = cleaned;
    }
    next();
  });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.useGlobalPipes(
    new SanitizeInputPipe(),
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalInterceptors(app.get(ResponseInterceptor));
  app.useGlobalFilters(app.get(AllExceptionsFilter));

  app.use(
    helmet({
      crossOriginOpenerPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
      hsts: { maxAge: 31536000 },
    }),
  );
  app.use(compression());
  const uploadsDir = configService.get<string>('UPLOADS_DIR') ?? 'uploads';
  app.use('/uploads', express.static(path.resolve(process.cwd(), uploadsDir)));

  const enforceHttps = (configService.get<string>('ENFORCE_HTTPS') ?? 'false') === 'true';
  if (enforceHttps) {
    app.enable('trust proxy');
    app.use((req: Request, res: Response, next: NextFunction) => {
      const forwardedProto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim();
      const proto = forwardedProto || req.protocol;
      if (proto === 'https' || req.secure) return next();
      const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
      if (!host) {
        return res.status(400).json({
          success: false,
          error: { code: 'ERR_HOST_HEADER_REQUIRED', message: 'Host header missing for HTTPS redirect' },
          correlationId: req.headers['x-correlation-id'],
        });
      }
      const target = `https://${host}${req.originalUrl || req.url}`;
      return res.redirect(308, target);
    });
  }

  const swaggerEnabled =
    configService.get('NODE_ENV') !== 'production' || configService.get('SWAGGER_ENABLED') === 'true';
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Fasket API')
      .setDescription('Grocery e-commerce API')
      .setVersion('1.0.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          in: 'header',
          name: 'Authorization',
        },
        'bearer',
      )
      .addServer('/api/v1', 'v1')
      .addServer('/api/v2', 'v2')
      .build();

    const swaggerUser = configService.get<string>('SWAGGER_BASIC_USER');
    const swaggerPass = configService.get<string>('SWAGGER_BASIC_PASS');
    if (swaggerUser && swaggerPass && configService.get('NODE_ENV') === 'production') {
      app.use('/api/docs', (req: Request, res: Response, next: NextFunction) => {
        const header = req.headers.authorization;
        if (!header || !header.startsWith('Basic ')) {
          res.setHeader('WWW-Authenticate', 'Basic realm="Docs"');
          return res.status(401).send('Authentication required');
        }
        const credentials = Buffer.from(header.replace('Basic ', ''), 'base64').toString();
        const [user, pass] = credentials.split(':');
        if (user !== swaggerUser || pass !== swaggerPass) {
          res.setHeader('WWW-Authenticate', 'Basic realm="Docs"');
          return res.status(401).send('Unauthorized');
        }
        return next();
      });
    }

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  } else {
    logger.log('Swagger is disabled for production. Set SWAGGER_ENABLED=true to re-enable.', 'Bootstrap');
  }

  // ==== CORS (patched) ====
  const originsRaw =
    configService.get<string>('ALLOWED_ORIGINS') ||
    configService.get<string>('CORS_ALLOWED_ORIGINS') ||
    '';
  const literalOrigins = new Set<string>();
  const regexOrigins: RegExp[] = [];
  originsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((entry) => {
      if (entry.toLowerCase().startsWith('regex:')) {
        const pattern = entry.slice(6);
        try {
          regexOrigins.push(new RegExp(pattern));
        } catch (error) {
          logger.warn(`Invalid CORS regex "${pattern}": ${(error as Error).message}`);
        }
        return;
      }
      literalOrigins.add(entry);
    });

  const allowLocalhostWildcard = (configService.get<string>('NODE_ENV') ?? 'development') !== 'production';
  const localhostRegexes = [
    /^https?:\/\/localhost(?::\d+)?$/i,
    /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i,
  ];

  app.enableCors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (literalOrigins.has(origin)) return callback(null, true);
      if (regexOrigins.some((rx) => rx.test(origin))) {
        return callback(null, true);
      }
      if (allowLocalhostWildcard && localhostRegexes.some((rx) => rx.test(origin))) {
        return callback(null, true);
      }
      logger.warn(`Rejected CORS origin "${origin}"`);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'X-User-Agent', 'x-user-agent'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });
  // ==== /CORS ====

  const port = configService.get<number>('PORT') ?? 4000;
  await app.listen(port);
}
bootstrap();
