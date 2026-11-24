import { UseInterceptors, applyDecorators } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

const MAX_MB = Number(process.env.MAX_UPLOAD_MB ?? 10);

/** Recibe un único archivo en el campo "archivo" con límite de tamaño. */
export const SubirArchivo = () =>
  applyDecorators(UseInterceptors(FileInterceptor('archivo', { storage: memoryStorage(), limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 } })));
