import { Module } from '@nestjs/common';
import { InstitucionesController } from './instituciones.controller';

@Module({ controllers: [InstitucionesController] })
export class InstitucionesModule {}
