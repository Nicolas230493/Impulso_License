import { Module } from '@nestjs/common';
import { NomencladorModule } from '../nomenclador/nomenclador.module';
import { CatalogoController } from './catalogo.controller';
import { CatalogoService } from './catalogo.service';
import { CircuitoService } from './circuito.service';
import { DisposicionesService } from './disposiciones.service';
import { SolicitudesController } from './solicitudes.controller';
import { SolicitudesService } from './solicitudes.service';

@Module({
  imports: [NomencladorModule],
  controllers: [CatalogoController, SolicitudesController],
  providers: [CatalogoService, SolicitudesService, CircuitoService, DisposicionesService],
  exports: [SolicitudesService, CircuitoService],
})
export class LicenciasModule {}
