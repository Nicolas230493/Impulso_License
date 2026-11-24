import { Module } from '@nestjs/common';
import { LicenciasModule } from '../licencias/licencias.module';
import { CargosController } from './cargos.controller';
import { CargosService } from './cargos.service';

@Module({ imports: [LicenciasModule], controllers: [CargosController], providers: [CargosService] })
export class CargosModule {}
