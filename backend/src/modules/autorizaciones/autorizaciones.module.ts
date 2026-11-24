import { Module } from '@nestjs/common';
import { LicenciasModule } from '../licencias/licencias.module';
import { AutorizacionesController } from './autorizaciones.controller';
import { AutorizacionesService } from './autorizaciones.service';

@Module({ imports: [LicenciasModule], controllers: [AutorizacionesController], providers: [AutorizacionesService] })
export class AutorizacionesModule {}
