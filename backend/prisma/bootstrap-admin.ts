/**
 * Alta del primer administrador en producción (hallazgo 5). Uso: npm run bootstrap:admin
 *
 * - Sincroniza el catálogo de permisos.
 * - Crea la institución si todavía no existe ninguna (pide nombre y código).
 * - Crea el rol ADMIN de sistema con todos los permisos y un único usuario administrador.
 * - La contraseña se ingresa de forma interactiva y no se muestra ni se registra.
 * - Se niega a correr si la institución ya tiene un administrador.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createInterface } from 'readline';
import { PERMISOS, P } from '../src/common/permisos';
import { MENSAJE_PASSWORD, passwordValida } from '../src/modules/auth/auth.dto';

const prisma = new PrismaClient();

function preguntar(texto: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(texto, (r) => { rl.close(); resolve(r.trim()); }));
}

/** Lee una línea sin mostrar lo que se escribe. */
function preguntarOculto(texto: string): Promise<string> {
  if (!process.stdin.isTTY) throw new Error('bootstrap:admin debe ejecutarse en una terminal interactiva');
  return new Promise((resolve) => {
    process.stdout.write(texto);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let valor = '';
    const alTeclear = (c: string) => {
      for (const ch of c) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', alTeclear);
          process.stdout.write('\n');
          return resolve(valor);
        }
        if (ch === '\u0003') process.exit(130); // Ctrl+C
        if (ch === '\u007f' || ch === '\b') valor = valor.slice(0, -1);
        else valor += ch;
      }
    };
    stdin.on('data', alTeclear);
  });
}

async function main() {
  for (const p of Object.values(PERMISOS)) {
    await prisma.permiso.upsert({ where: { codigo: p.codigo }, create: p, update: { modulo: p.modulo, descripcion: p.descripcion } });
  }
  const permisos = await prisma.permiso.findMany({ where: { codigo: { in: Object.values(P) } } });

  let inst = await prisma.institucion.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!inst) {
    const nombre = await preguntar('Nombre de la institución: ');
    const codigo = (await preguntar('Código corto de la institución (A-Z, 0-9; se usa en la numeración): ')).toUpperCase();
    if (!nombre || !/^[A-Z0-9]{2,12}$/.test(codigo)) throw new Error('Nombre o código inválido');
    const gestion = (await preguntar('Tipo de gestión (PUBLICA/PRIVADA): ')).toUpperCase();
    if (gestion !== 'PUBLICA' && gestion !== 'PRIVADA') throw new Error('Tipo de gestión inválido');
    inst = await prisma.institucion.create({ data: { nombre, codigo, tipoGestion: gestion } });
  }

  const rolAdmin =
    (await prisma.rol.findUnique({ where: { institucionId_codigo: { institucionId: inst.id, codigo: 'ADMIN' } } })) ??
    (await prisma.rol.create({
      data: {
        institucionId: inst.id, codigo: 'ADMIN', nombre: 'Administrador del sistema', descripcion: 'Acceso total a la configuración', sistema: true,
        permisos: { create: permisos.map((p) => ({ permisoId: p.id })) },
      },
    }));
  if (await prisma.usuario.count({ where: { institucionId: inst.id, roles: { some: { rolId: rolAdmin.id } } } })) {
    throw new Error('La institución ya tiene un administrador. Este comando solo crea el primero.');
  }

  const email = (await preguntar('Correo del administrador: ')).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Correo inválido');
  const nombre = await preguntar('Nombre: ');
  const apellido = await preguntar('Apellido: ');
  const password = await preguntarOculto('Contraseña: ');
  if (!passwordValida(password)) throw new Error(`${MENSAJE_PASSWORD} (y hasta 72 bytes)`);
  if ((await preguntarOculto('Repita la contraseña: ')) !== password) throw new Error('Las contraseñas no coinciden');

  const u = await prisma.usuario.create({
    data: {
      institucionId: inst.id, email, nombre: nombre || 'Administrador', apellido: apellido || 'Sistema',
      passwordHash: await bcrypt.hash(password, 12), roles: { create: [{ rolId: rolAdmin.id }] },
    },
  });
  await prisma.auditoria.create({ data: { institucionId: inst.id, usuarioId: u.id, accion: 'BOOTSTRAP_ADMIN', entidad: 'usuario', entidadId: u.id } });
  console.log(`Administrador creado para ${inst.nombre}.`);
}

main()
  .catch((e) => {
    console.error(`Error: ${(e as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
