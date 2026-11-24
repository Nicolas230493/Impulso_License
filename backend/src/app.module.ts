import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { JwtAuthGuard, PermisosGuard } from './common/guards';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';
import { SensitiveModule } from './common/sensitive/sensitive.module';
import { opcionesThrottler } from './common/throttling';
import { entorno, validarEntorno } from './config/entorno';
import { AuditoriaModule } from './modules/auditoria/auditoria.module';
import { ArchivosModule } from './modules/archivos/archivos.module';
import { NotificacionesModule } from './modules/notificaciones/notificaciones.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';
import { InstitucionesModule } from './modules/instituciones/instituciones.module';
import { DocentesModule } from './modules/docentes/docentes.module';
import { CargosModule } from './modules/cargos/cargos.module';
import { LicenciasModule } from './modules/licencias/licencias.module';
import { AutorizacionesModule } from './modules/autorizaciones/autorizaciones.module';
import { ReemplazosModule } from './modules/reemplazos/reemplazos.module';
import { AsistenciasModule } from './modules/asistencias/asistencias.module';
import { ReportesModule } from './modules/reportes/reportes.module';
import { NomencladorModule } from './modules/nomenclador/nomenclador.module';

@Module({
  imports: [
    // Hallazgos 9, 10, 19 y 31: el entorno se valida al iniciar; una configuración insegura impide el arranque.
    ConfigModule.forRoot({ isGlobal: true, validate: validarEntorno }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({ useFactory: () => opcionesThrottler(entorno()) }),
    PrismaModule,
    SensitiveModule,
    AuditoriaModule,
    ArchivosModule,
    NotificacionesModule,
    AuthModule,
    UsuariosModule,
    InstitucionesModule,
    DocentesModule,
    CargosModule,
    LicenciasModule,
    AutorizacionesModule,
    ReemplazosModule,
    AsistenciasModule,
    ReportesModule,
    NomencladorModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermisosGuard },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}
