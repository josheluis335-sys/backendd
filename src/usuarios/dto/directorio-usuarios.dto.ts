import { IsOptional, IsUUID } from 'class-validator';

export class DirectorioUsuariosDto {
  @IsOptional()
  @IsUUID('4', { message: 'El área debe ser un identificador válido.' })
  areaId?: string;
}
