import { IsEmail, IsJWT, IsString, Matches, MaxLength, MinLength, ValidateBy } from 'class-validator';

/** bcrypt solo considera los primeros 72 bytes: una contraseña más larga se truncaría sin aviso. */
export const MAX_BYTES_PASSWORD = 72;
export const MaxBytes = (n: number) =>
  ValidateBy({
    name: 'maxBytes',
    validator: {
      validate: (v) => typeof v === 'string' && Buffer.byteLength(v, 'utf8') <= n,
      defaultMessage: () => `La contraseña no puede superar los ${n} bytes`,
    },
  });
/** Para scripts (seed, bootstrap): mismo criterio que los DTO. */
export const passwordValida = (p: string) => REGLA_PASSWORD.test(p) && Buffer.byteLength(p, 'utf8') <= MAX_BYTES_PASSWORD;

export class LoginDto {
  @IsEmail({}, { message: 'Correo electrónico inválido' }) email: string;
  @IsString() @MinLength(1) @MaxLength(200) password: string;
}

export const REGLA_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,}$/;
export const MENSAJE_PASSWORD = 'La contraseña debe tener al menos 10 caracteres, con mayúsculas, minúsculas y números';

export class CambiarPasswordDto {
  @IsString() @MaxLength(200) actual: string;
  @IsString() @MaxBytes(MAX_BYTES_PASSWORD) @Matches(REGLA_PASSWORD, { message: MENSAJE_PASSWORD }) nueva: string;
}

const CODIGO_TOTP = /^\d{6}$/;

export class LoginSegundoFactorDto {
  @IsJWT() desafio: string;
  @Matches(CODIGO_TOTP, { message: 'El código tiene 6 dígitos' }) codigo: string;
}

export class CodigoTotpDto {
  @Matches(CODIGO_TOTP, { message: 'El código tiene 6 dígitos' }) codigo: string;
}

export class DesactivarTotpDto extends CodigoTotpDto {
  @IsString() @MaxLength(200) password: string;
}
