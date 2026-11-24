import { Module } from '@nestjs/common';
import { CalendarioService } from './calendario.service';
import { NomencladorController } from './nomenclador.controller';
import { NomencladorService } from './nomenclador.service';
import { ReglasLicenciaService } from './reglas-licencia.service';

@Module({
  controllers: [NomencladorController],
  providers: [NomencladorService, ReglasLicenciaService, CalendarioService],
  exports: [ReglasLicenciaService, CalendarioService],
})
export class NomencladorModule {}
