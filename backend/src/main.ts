import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { entorno } from './config/entorno';

async function bootstrap() {
  // Falla antes de levantar nada si la configuración es insegura (también lo valida ConfigModule).
  const e = entorno();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Hallazgo 19: solo se confía en X-Forwarded-For si viene del proxy real (IP o subred en TRUSTED_PROXIES).
  // Sin proxies configurados, req.ip es la IP de la conexión y el header se ignora.
  app.set('trust proxy', e.TRUSTED_PROXIES.length ? e.TRUSTED_PROXIES : false);
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  // Hallazgo 31: orígenes exactos, ya normalizados y sin "*".
  app.enableCors({
    origin: e.CORS_ORIGINS,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();
  await app.listen(e.PORT);
  Logger.log(`Impulso License API escuchando en el puerto ${e.PORT} (${e.NODE_ENV})`, 'Bootstrap');
}
bootstrap().catch((err) => {
  Logger.error((err as Error).message, undefined, 'Bootstrap');
  process.exit(1);
});
