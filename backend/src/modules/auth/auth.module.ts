import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { SesionesPurgaService } from './sesiones-purga.service';
import { entorno } from '../../config/entorno';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: entorno().JWT_ACCESS_SECRET,
        signOptions: { expiresIn: entorno().JWT_ACCESS_TTL as `${number}m`, algorithm: 'HS256' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, SesionesPurgaService],
})
export class AuthModule {}
