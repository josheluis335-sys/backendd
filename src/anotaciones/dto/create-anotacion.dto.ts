import { Transform } from 'class-transformer';
import {
  IsString,
  Length,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'noControlCharacters', async: false })
class NoControlCharacters implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return true;
    return Array.from(value).every((character) => {
      const code = character.codePointAt(0)!;
      return !(code < 32 && code !== 10 && code !== 13) && code !== 127;
    });
  }

  defaultMessage(): string {
    return 'La anotación contiene caracteres de control no permitidos.';
  }
}

export class CreateAnotacionDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'El texto de la anotación debe ser texto.' })
  @Length(1, 2000, { message: 'La anotación debe tener entre 1 y 2000 caracteres.' })
  @Validate(NoControlCharacters)
  texto!: string;
}
