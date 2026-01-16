import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { createProxyMiddleware } from "http-proxy-middleware";

function env(name: string, fallback: string) {
  return process.env[name] || fallback;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const AUTH_URL = env("AUTH_URL", "http://auth-service:3000");
  const USERS_URL = env("USERS_URL", "http://users-service:3000");
  const DOCTORS_URL = env("DOCTORS_URL", "http://doctors-service:3000");
  const PHARMACIES_URL = env("PHARMACIES_URL", "http://pharmacies-service:3000");
  const REMINDERS_URL = env("REMINDERS_URL", "http://reminders-service:3000");
  const EMERGENCIES_URL = env("EMERGENCIES_URL", "http://emergencies-service:3000");
  const AI_URL = env("AI_URL", "http://ai-service:3000");

  // Health endpoint for probes
  app.getHttpAdapter().get("/health", (_req: any, res: any) => res.json({ status: "ok" }));

  // Proxy routes
  app.use("/auth", createProxyMiddleware({ target: AUTH_URL, changeOrigin: true, pathRewrite: { "^/auth": "" } }));
  app.use("/users", createProxyMiddleware({ target: USERS_URL, changeOrigin: true, pathRewrite: { "^/users": "" } }));
  app.use("/doctors", createProxyMiddleware({ target: DOCTORS_URL, changeOrigin: true, pathRewrite: { "^/doctors": "" } }));
  app.use("/pharmacies", createProxyMiddleware({ target: PHARMACIES_URL, changeOrigin: true, pathRewrite: { "^/pharmacies": "" } }));
  app.use("/reminders", createProxyMiddleware({ target: REMINDERS_URL, changeOrigin: true, pathRewrite: { "^/reminders": "" } }));
  app.use("/emergencies", createProxyMiddleware({ target: EMERGENCIES_URL, changeOrigin: true, pathRewrite: { "^/emergencies": "" } }));
  app.use("/ai", createProxyMiddleware({ target: AI_URL, changeOrigin: true, pathRewrite: { "^/ai": "" } }));

  const port = process.env.PORT || "3000";
  await app.listen(port);
}
bootstrap();
