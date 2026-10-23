import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AreasService } from '../areas/areas.service.js';
import { ClockService } from '../common/clock/clock.service.js';
import { UserRole } from '../common/enums/user-role.enum.js';
import { USUARIOS_REPOSITORY } from '../usuarios/usuarios.constants.js';
import type { Usuario } from '../usuarios/entities/usuario.entity.js';
import type { UsuariosRepository } from '../usuarios/interfaces/usuarios.repository.interface.js';
import { ESCALAMIENTOS_REPOSITORY } from './escalamientos.constants.js';
import type { Escalamiento } from './entities/escalamiento.entity.js';
import type { EscalamientosRepository } from './interfaces/escalamientos.repository.interface.js';

export interface EscalamientoDto extends Escalamiento {
  area: { id: string; nombre: string };
  asignadoPor: { id: string; nombre: string } | null;
  recibidoPor: { id: string; nombre: string } | null;
}

@Injectable()
export class EscalamientosService {
  constructor(
    @Inject(ESCALAMIENTOS_REPOSITORY)
    private readonly repository: EscalamientosRepository,
    private readonly areasService: AreasService,
    @Inject(USUARIOS_REPOSITORY)
    private readonly usuariosRepository: UsuariosRepository,
    private readonly clock: ClockService,
  ) {}

  async registrar(
    ticketId: string,
    areaId: string,
    asignadoPorId: string,
    comentario: string,
    recibidoPorId?: string,
  ): Promise<void> {
    await this.repository.agregar({
      id: randomUUID(),
      ticketId,
      areaId,
      asignadoPorId,
      ...(recibidoPorId === undefined ? {} : { recibidoPorId }),
      fecha: this.clock.ahora().toISOString(),
      comentario,
    });
  }

  async listarPorTicket(ticketId: string): Promise<EscalamientoDto[]> {
    return this.enrichRecords(await this.repository.listarPorTicket(ticketId));
  }

  async listarPorTickets(ticketIds: readonly string[]): Promise<Map<string, EscalamientoDto[]>> {
    const recordsByTicket = await this.repository.listarPorTickets(ticketIds);
    const enriched = await Promise.all(
      [...recordsByTicket.entries()].map(async ([ticketId, records]) => [
        ticketId,
        await this.enrichRecords(records),
      ] as const),
    );
    return new Map(enriched);
  }

  private async enrichRecords(records: Escalamiento[]): Promise<EscalamientoDto[]> {
    const orderedRecords = [...records].sort(
      (left, right) => left.fecha.localeCompare(right.fecha),
    );
    return Promise.all(
      orderedRecords.map(async (record) => {
        const [area, asignadoPor, recibidoPor] = await Promise.all([
          this.areasService.findById(record.areaId),
          this.findUser(record.asignadoPorId),
          record.recibidoPorId ? this.findUser(record.recibidoPorId) : Promise.resolve(null),
        ]);
        return {
          ...record,
          area: { id: area.id, nombre: area.nombre },
          asignadoPor: this.userName(asignadoPor),
          recibidoPor: this.userName(recibidoPor),
        };
      }),
    );
  }

  async ultimoPorTicket(ticketId: string): Promise<Escalamiento | null> {
    const records = await this.repository.listarPorTicket(ticketId);
    return records.length === 0 ? null : records[records.length - 1];
  }

  async validarDestino(areaId: string, recibidoPorId?: string): Promise<void> {
    const area = await this.areasService.findById(areaId);
    if (!area.activa) {
      throw new ConflictException('El área de destino debe estar activa.');
    }
    if (!recibidoPorId) return;
    const user = await this.usuariosRepository.findById(recibidoPorId);
    if (
      !user ||
      !user.activo ||
      (user.rol !== UserRole.AGENTE && user.rol !== UserRole.SUPERVISOR) ||
      user.areaId !== areaId
    ) {
      throw new ConflictException(
        'El usuario receptor debe estar activo, pertenecer al área de destino y tener rol AGENTE o SUPERVISOR.',
      );
    }
  }

  private async findUser(id: string): Promise<Usuario | null> {
    const user = await this.usuariosRepository.findById(id);
    if (!user) {
      throw new NotFoundException('No se encontró el usuario histórico del escalamiento.');
    }
    return user;
  }

  private userName(user: Usuario | null): { id: string; nombre: string } | null {
    return user ? { id: user.id, nombre: user.nombre } : null;
  }
}
