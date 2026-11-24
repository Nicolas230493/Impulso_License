import { Module } from '@nestjs/common';
import { ReemplazosController } from './reemplazos.controller';
import { ReemplazosService } from './reemplazos.service';

@Module({ controllers: [ReemplazosController], providers: [ReemplazosService] })
export class ReemplazosModule {}
