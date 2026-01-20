import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { createProxyMiddleware } from "http-proxy-middleware";
import { ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

function env(name: string, fallback: string) {
  return process.env[name] || fallback;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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

  // Proxy routes
  app.use('/auth', createProxyMiddleware(proxyOptions(AUTH_URL, 'auth', 'auth-service')));
  app.use('/users', createProxyMiddleware(proxyOptions(USERS_URL, 'users', 'users-service')));
  app.use('/doctors', createProxyMiddleware(proxyOptions(DOCTORS_URL, 'doctors', 'doctors-service')));
  app.use('/pharmacies', createProxyMiddleware(proxyOptions(PHARMACIES_URL, 'pharmacies', 'pharmacies-service')));
  app.use('/reminders', createProxyMiddleware(proxyOptions(REMINDERS_URL, 'reminders', 'reminders-service')));
  app.use('/emergencies', createProxyMiddleware(proxyOptions(EMERGENCIES_URL, 'emergencies', 'emergencies-service')));
  app.use('/ai', createProxyMiddleware(proxyOptions(AI_URL, 'ai', 'ai-service')));

  const port = process.env.PORT || "3000";
  await app.listen(port);
}
bootstrap();
