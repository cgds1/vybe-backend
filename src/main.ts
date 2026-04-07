import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { RedisIoAdapter } from './gateway/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Pino logger
  app.useLogger(app.get(Logger));

  // Trust proxy (Railway / Nginx)
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Security headers
  app.use(helmet());

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || true,
    credentials: true,
  });

  // Shutdown hooks
  app.enableShutdownHooks();

  // Redis WebSocket adapter
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis(redisHost, redisPort);
  app.useWebSocketAdapter(redisIoAdapter);

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Serialization
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Vybe API')
    .setDescription('Vybe backend API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT || 3000, '0.0.0.0');
}
bootstrap();
