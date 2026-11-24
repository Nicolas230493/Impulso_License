import { useAuth } from '@/hooks/useAuth';
import { Vacio } from '@/components/ui';
import { FichaDocente } from './DocenteDetalle';

export default function MiLegajo() {
  const { usuario } = useAuth();
  if (!usuario?.docenteId) return <Vacio texto="Su usuario no está vinculado a un legajo docente." />;
  return <FichaDocente id={usuario.docenteId} />;
}
