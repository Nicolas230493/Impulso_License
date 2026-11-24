-- Vínculo de rotación del refresh token: margen de gracia para renovaciones simultáneas desde varias pestañas.
ALTER TABLE "sesiones" ADD COLUMN "reemplazada_por_id" TEXT;
