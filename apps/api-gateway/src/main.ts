import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { createProxyMiddleware } from "http-proxy-middleware";
import { ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { json } from 'express';

function env(name: string, fallback: string) {
  return process.env[name] || fallback;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS: required for Expo web / browser clients (handles OPTIONS preflight).
  // For local dev we allow any origin; tighten this in production.
  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const AUTH_URL = env("AUTH_URL", "http://auth-service:3000");
  const USERS_URL = env("USERS_URL", "http://users-service:3000");
  const DOCTORS_URL = env("DOCTORS_URL", "http://doctors-service:3000");
  const PHARMACIES_URL = env("PHARMACIES_URL", "http://pharmacies-service:3000");
  const REMINDERS_URL = env("REMINDERS_URL", "http://reminders-service:3000");
  const EMERGENCIES_URL = env("EMERGENCIES_URL", "http://emergencies-service:3000");
  const AI_URL = env("AI_URL", "http://ai-service:3000");

  // Health endpoint for probes
  app.getHttpAdapter().get("/health", (_req: any, res: any) => res.json({ status: "ok" }));
  // Option A: support /api prefix used by frontend clients
  app.getHttpAdapter().get("/api/health", (_req: any, res: any) => res.json({ status: "ok" }));

  const proxyErrorHandler = (serviceName: string) => (err: any, req: any, res: any) => {
    const statusCode = 502;
    res.status(statusCode).json({
      statusCode,
      message: `Bad gateway: ${serviceName} unavailable`,
      error: 'BadGateway',
      path: req.originalUrl || req.url,
      timestamp: new Date().toISOString(),
    });
  };

  const proxyOptions = (target: string, basePath: string, serviceName: string) =>
    ({
      target,
      changeOrigin: true,
      pathRewrite: { [`^/${basePath}`]: '' },
      onError: proxyErrorHandler(serviceName),
    }) as any;

  // Users service expects `/users/*` paths (controller is mounted under `/users`).
  // Add `/users` back after Express strips the mount path.
  const usersProxyOptions = (target: string, serviceName: string) =>
    ({
      target,
      changeOrigin: true,
      pathRewrite: (path: string) => `/users${path}`,
      onError: proxyErrorHandler(serviceName),
    }) as any;

  // Reminders service exposes multiple controllers:
  // - /reminders/* (RemindersController)
  // - /calendar/* (CalendarController)
  // - /trackers/* (TrackersController)
  // The gateway mounts at /reminders, so strip that prefix for calendar/trackers,
  // and add it back for reminders routes.
  const remindersProxyOptions = (target: string, serviceName: string) =>
    ({
      target,
      changeOrigin: true,
      pathRewrite: (path: string) => {
        if (path.startsWith('/trackers') || path.startsWith('/calendar')) return path;
        return `/reminders${path}`;
      },
      onError: proxyErrorHandler(serviceName),
    }) as any;

  // AI service expects `/ai/*` paths (controller is mounted under `/ai`).
  const aiProxyOptions = (target: string, serviceName: string) =>
    ({
      target,
      changeOrigin: true,
      pathRewrite: (path: string) => `/ai${path}`,
      onError: proxyErrorHandler(serviceName),
    }) as any;

  // Auth controllers are mounted under `/auth`, but Express strips the mount path.
  // Add `/auth` back before proxying.
  const authProxyOptions = (target: string, serviceName: string) =>
    ({
      target,
      changeOrigin: true,
      pathRewrite: (path: string) => `/auth${path}`,
      onError: proxyErrorHandler(serviceName),
    }) as any;

  // Doctors service expects `/doctors/*` paths (controller is mounted under `/doctors`).
  const doctorsProxyOptions = (target: string, serviceName: string) =>
    ({
      target,
      changeOrigin: true,
      pathRewrite: (path: string) => `/doctors${path}`,
      onError: proxyErrorHandler(serviceName),
    }) as any;

  // Proxy routes
  app.use('/auth', createProxyMiddleware(authProxyOptions(AUTH_URL, 'auth-service')));
  app.use('/api/auth', createProxyMiddleware(authProxyOptions(AUTH_URL, 'auth-service')));

  app.use('/users', createProxyMiddleware(usersProxyOptions(USERS_URL, 'users-service')));
  app.use('/api/users', createProxyMiddleware(usersProxyOptions(USERS_URL, 'users-service')));

  app.use('/doctors', createProxyMiddleware(doctorsProxyOptions(DOCTORS_URL, 'doctors-service')));
  app.use('/api/doctors', createProxyMiddleware(doctorsProxyOptions(DOCTORS_URL, 'doctors-service')));

  // Pharmacies service expects `/pharmacies/*` paths (controller is mounted under `/pharmacies`).
  // Add `/pharmacies` back after Express strips the mount path.
  const pharmaciesProxyOptions = (target: string, serviceName: string) =>
    ({
      target,
      changeOrigin: true,
      pathRewrite: (path: string) => `/pharmacies${path}`,
      onError: proxyErrorHandler(serviceName),
    }) as any;

  app.use('/pharmacies', createProxyMiddleware(pharmaciesProxyOptions(PHARMACIES_URL, 'pharmacies-service')));
  app.use('/api/pharmacies', createProxyMiddleware(pharmaciesProxyOptions(PHARMACIES_URL, 'pharmacies-service')));

  app.use('/reminders', createProxyMiddleware(remindersProxyOptions(REMINDERS_URL, 'reminders-service')));
  app.use('/api/reminders', createProxyMiddleware(remindersProxyOptions(REMINDERS_URL, 'reminders-service')));

  app.use('/emergencies', createProxyMiddleware(proxyOptions(EMERGENCIES_URL, 'emergencies', 'emergencies-service')));
  app.use('/api/emergencies', createProxyMiddleware(proxyOptions(EMERGENCIES_URL, 'emergencies', 'emergencies-service')));

  const aiTimeoutMs = Number(env("AI_PROXY_TIMEOUT_MS", "8000"));
  const aiRetries = Math.max(0, Number(env("AI_PROXY_RETRIES", "1")));

  app.use('/ai', json({ limit: '1mb' }));
  app.use('/ai', async (req: any, res: any) => {
    const targetUrl = `${AI_URL}${req.originalUrl || req.url}`;

    const method = (req.method || 'GET').toUpperCase();
    const hasBody = !['GET', 'HEAD'].includes(method);
    const rawBody = hasBody ? req.body : undefined;

    const makeBody = () => {
      if (!hasBody) return undefined;
      if (rawBody == null) return undefined;
      if (Buffer.isBuffer(rawBody) || typeof rawBody === 'string') return rawBody;
      return JSON.stringify(rawBody);
    };

    const makeHeaders = () => {
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers || {})) {
        if (!value) continue;
        if (key.toLowerCase() === 'host') continue;
        if (key.toLowerCase() === 'content-length') continue;
        headers[key] = Array.isArray(value) ? value.join(',') : String(value);
      }
      if (hasBody && rawBody && typeof rawBody === 'object' && !Buffer.isBuffer(rawBody)) {
        headers['content-type'] = 'application/json';
      }
      return headers;
    };

    for (let attempt = 0; attempt <= aiRetries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), aiTimeoutMs);

      try {
        const upstream = await fetch(targetUrl, {
          method,
          headers: makeHeaders(),
          body: makeBody() as any,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        res.status(upstream.status);
        const contentType = upstream.headers.get('content-type');
        if (contentType) res.setHeader('content-type', contentType);

        const buf = Buffer.from(await upstream.arrayBuffer());
        res.send(buf);
        return;
      } catch (err) {
        clearTimeout(timeout);
        if (attempt >= aiRetries) {
          res.status(504).json({
            statusCode: 504,
            message: 'AI service timeout',
            error: 'GatewayTimeout',
            path: req.originalUrl || req.url,
            timestamp: new Date().toISOString(),
          });
          return;
        }
      }
    }
  });

  const port = process.env.PORT || "3000";
  await app.listen(port);
}
bootstrap();
