"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const swagger_1 = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const helmet_1 = require("helmet");
const path = require("path");
const Sentry = require("@sentry/node");
const profiling_node_1 = require("@sentry/profiling-node");
const crypto_1 = require("crypto");
const nestjs_pino_1 = require("nestjs-pino");
const sanitize_input_pipe_1 = require("./common/pipes/sanitize-input.pipe");
const request_context_service_1 = require("./common/context/request-context.service");
const response_interceptor_1 = require("./common/interceptors/response.interceptor");
const all_exceptions_filter_1 = require("./common/filters/all-exceptions.filter");
const compression = require('compression');
const express = require('express');
if (process.env.SENTRY_DSN) {
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.2'),
        profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.2'),
        integrations: [(0, profiling_node_1.nodeProfilingIntegration)()],
        environment: process.env.NODE_ENV,
    });
}
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        bufferLogs: true,
    });
    const configService = app.get(config_1.ConfigService);
    const logger = app.get(nestjs_pino_1.Logger);
    app.useLogger(logger);
    const context = app.get(request_context_service_1.RequestContextService);
    app.use((req, res, next) => {
        const correlationId = req.headers['x-correlation-id'] || (0, crypto_1.randomUUID)();
        req.headers['x-correlation-id'] = correlationId;
        res.setHeader('x-correlation-id', correlationId);
        context.run(() => {
            context.set('ip', req.ip);
            context.set('userAgent', req.headers['user-agent']);
            next();
        }, { correlationId, ip: req.ip, userAgent: req.headers['user-agent'] });
    });
    const rawPrefix = configService.get('API_PREFIX') ?? 'api';
    const normalizedPrefix = rawPrefix.replace(/^\/+|\/+$/g, '');
    const sanitizedPrefix = normalizedPrefix.replace(/\/v\d+$/i, '');
    const finalPrefix = sanitizedPrefix || normalizedPrefix || 'api';
    app.use('/monitnow', (_req, res) => res.status(200).json({ ok: true }));
    if (sanitizedPrefix !== normalizedPrefix) {
        logger.warn(`API_PREFIX "${rawPrefix}" contained a version segment. Using "${finalPrefix}" and relying on Nest versioning.`);
    }
    app.setGlobalPrefix(finalPrefix);
    const PREFIX_NORMALIZED_SYMBOL = Symbol('prefix-normalized');
    app.use((req, _res, next) => {
        if (!finalPrefix)
            return next();
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
    app.use((req, _res, next) => {
        const pattern = new RegExp(`^(/${finalPrefix}/v\\d+)/${finalPrefix}/v\\d+(\\/|$)`);
        if (pattern.test(req.url)) {
            const cleaned = req.url.replace(pattern, '$1$2');
            logger.warn(`Normalized duplicate API prefix: "${req.url}" -> "${cleaned}"`);
            req.url = cleaned;
        }
        next();
    });
    app.use((req, _res, next) => {
        const originalUrl = req.url;
        const cleaned = originalUrl.replace(/\/(v\d+)\/\1(\/|$)/gi, '/$1$2');
        if (cleaned !== originalUrl) {
            logger.warn(`Normalized duplicate API version segments: "${originalUrl}" -> "${cleaned}"`);
            req.url = cleaned;
        }
        next();
    });
    app.enableVersioning({
        type: common_1.VersioningType.URI,
        defaultVersion: '1',
    });
    app.useGlobalPipes(new sanitize_input_pipe_1.SanitizeInputPipe(), new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        stopAtFirstError: true,
        transformOptions: { enableImplicitConversion: true },
    }));
    app.useGlobalInterceptors(app.get(response_interceptor_1.ResponseInterceptor));
    app.useGlobalFilters(app.get(all_exceptions_filter_1.AllExceptionsFilter));
    app.use((0, helmet_1.default)({
        crossOriginOpenerPolicy: false,
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: false,
        hsts: { maxAge: 31536000 },
    }));
    app.use(compression());
    const uploadsDir = configService.get('UPLOADS_DIR') ?? 'uploads';
    app.use('/uploads', express.static(path.resolve(process.cwd(), uploadsDir)));
    const enforceHttps = (configService.get('ENFORCE_HTTPS') ?? 'false') === 'true';
    if (enforceHttps) {
        app.enable('trust proxy');
        app.use((req, res, next) => {
            const forwardedProto = req.headers['x-forwarded-proto']?.split(',')[0]?.trim();
            const proto = forwardedProto || req.protocol;
            if (proto === 'https' || req.secure)
                return next();
            const host = req.headers['x-forwarded-host'] || req.headers.host;
            if (!host) {
                return res.status(400).json({
                    success: false,
                    code: 'ERR_HOST_HEADER_REQUIRED',
                    message: 'Host header missing for HTTPS redirect',
                    correlationId: req.headers['x-correlation-id'],
                });
            }
            const target = `https://${host}${req.originalUrl || req.url}`;
            return res.redirect(308, target);
        });
    }
    const swaggerEnabled = configService.get('NODE_ENV') !== 'production' || configService.get('SWAGGER_ENABLED') === 'true';
    if (swaggerEnabled) {
        const config = new swagger_1.DocumentBuilder()
            .setTitle('Fasket API')
            .setDescription('Grocery e-commerce API')
            .setVersion('1.0.0')
            .addBearerAuth({
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            in: 'header',
            name: 'Authorization',
        }, 'bearer')
            .addServer('/api/v1', 'v1')
            .addServer('/api/v2', 'v2')
            .build();
        const swaggerUser = configService.get('SWAGGER_BASIC_USER');
        const swaggerPass = configService.get('SWAGGER_BASIC_PASS');
        if (swaggerUser && swaggerPass && configService.get('NODE_ENV') === 'production') {
            app.use('/api/docs', (req, res, next) => {
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
        const document = swagger_1.SwaggerModule.createDocument(app, config);
        swagger_1.SwaggerModule.setup('api/docs', app, document, {
            swaggerOptions: { persistAuthorization: true },
        });
    }
    else {
        logger.log('Swagger is disabled for production. Set SWAGGER_ENABLED=true to re-enable.', 'Bootstrap');
    }
    const originsRaw = configService.get('ALLOWED_ORIGINS') ||
        configService.get('CORS_ALLOWED_ORIGINS') ||
        '';
    const literalOrigins = new Set();
    const regexOrigins = [];
    originsRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((entry) => {
        if (entry.toLowerCase().startsWith('regex:')) {
            const pattern = entry.slice(6);
            try {
                regexOrigins.push(new RegExp(pattern));
            }
            catch (error) {
                logger.warn(`Invalid CORS regex "${pattern}": ${error.message}`);
            }
            return;
        }
        literalOrigins.add(entry);
    });
    const allowLocalhostWildcard = (configService.get('NODE_ENV') ?? 'development') !== 'production';
    const localhostRegexes = [
        /^https?:\/\/localhost(?::\d+)?$/i,
        /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i,
    ];
    app.enableCors({
        origin(origin, callback) {
            if (!origin)
                return callback(null, true);
            if (literalOrigins.has(origin))
                return callback(null, true);
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
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'X-Requested-With',
            'Accept',
            'X-User-Agent',
            'x-user-agent',
            'X-Refresh-Token',
            'x-refresh-token',
            'X-Correlation-Id',
            'x-correlation-id',
        ],
        exposedHeaders: [
            'X-Refresh-Token',
            'x-refresh-token',
            'X-Correlation-Id',
            'x-correlation-id',
        ],
        preflightContinue: false,
        optionsSuccessStatus: 204,
    });
    const port = configService.get('PORT') ?? 4000;
    await app.listen(port);
}
bootstrap();
//# sourceMappingURL=main.js.map