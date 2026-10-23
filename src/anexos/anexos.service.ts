import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { ClockService } from '../common/clock/clock.service.js';
import { TicketActionUnitOfWork } from '../common/clock/ticket-action-unit-of-work.js';
import { UserRole } from '../common/enums/user-role.enum.js';
import { TicketStatus } from '../tickets/entities/ticket.entity.js';
import { TICKET_ACTION_UNIT_OF_WORK, TICKETS_REPOSITORY } from '../tickets/tickets.constants.js';
import type { TicketsRepository } from '../tickets/interfaces/tickets.repository.interface.js';
import type { TicketActor } from '../tickets/policy/ticket-visibility.policy.js';
import { TicketVisibilityPolicy } from '../tickets/policy/ticket-visibility.policy.js';
import { USUARIOS_REPOSITORY } from '../usuarios/usuarios.constants.js';
import type { UsuariosRepository } from '../usuarios/interfaces/usuarios.repository.interface.js';
import { ANEXOS_REPOSITORY, FILE_STORAGE } from './anexos.constants.js';
import type { Anexo } from './entities/anexo.entity.js';
import type { AnexosRepository } from './interfaces/anexos.repository.interface.js';
import { StoredFileNotFoundError } from './interfaces/file-storage.interface.js';
import type { FileStorage } from './interfaces/file-storage.interface.js';
import { validateAttachments } from './file-validation.js';
import type { IncomingAttachment } from './file-validation.js';
import type { ListAnexosDto } from './dto/list-anexos.dto.js';

const MAX_FILE_SIZE = 10_485_760;

export interface AnexoResponseDto {
  id: string;
  ticketId: string;
  autorId: string;
  autorNombre: string;
  nombreOriginal: string;
  mimeType: string;
  tamano: number;
  fecha: string;
}

export interface DownloadableAttachment {
  metadata: AnexoResponseDto;
  contents: Buffer;
}

@Injectable()
export class AnexosService {
  private readonly logger = new Logger(AnexosService.name);

  constructor(
    @Inject(ANEXOS_REPOSITORY)
    private readonly repository: AnexosRepository,
    @Inject(FILE_STORAGE)
    private readonly storage: FileStorage,
    @Inject(TICKETS_REPOSITORY)
    private readonly ticketsRepository: TicketsRepository,
    @Inject(USUARIOS_REPOSITORY)
    private readonly usuariosRepository: UsuariosRepository,
    private readonly visibility: TicketVisibilityPolicy,
    @Inject(TICKET_ACTION_UNIT_OF_WORK)
    private readonly unitOfWork: TicketActionUnitOfWork,
    private readonly clock: ClockService,
    private readonly config: ConfigService,
  ) {}

  async upload(
    ticketId: string,
    files: IncomingAttachment[],
    actor: TicketActor,
  ): Promise<AnexoResponseDto[]> {
    if (actor.rol !== UserRole.AGENTE) {
      throw new ForbiddenException('Solo un agente puede adjuntar archivos.');
    }
    await this.requireWritableTicket(ticketId, actor);
    const maxPerRequest = this.config.get<number>('ANEXOS_MAX_POR_PETICION', 5);
    let validated: ReturnType<typeof validateAttachments>;
    try {
      if (files.length > maxPerRequest) {
        throw new ConflictException(
          `Puedes adjuntar como máximo ${maxPerRequest} archivos por solicitud.`,
        );
      }
      validated = validateAttachments(files, MAX_FILE_SIZE);
    } catch (error) {
      const reason =
        error instanceof ConflictException
          ? 'LIMITE_POR_PETICION'
          : error instanceof Error && error.message.includes('10 MB')
            ? 'TAMANO_EXCEDIDO'
            : 'TIPO_O_CONTENIDO_INVALIDO';
      this.logger.warn(`Anexo rechazado. Usuario: ${actor.id}; motivo: ${reason}.`);
      throw error;
    }

    const storedKeys: string[] = [];
    let saved: Anexo[];
    try {
      const stagedMetadata: Anexo[] = [];
      for (const file of validated) {
        const key = await this.storage.guardar(file.buffer);
        storedKeys.push(key);
        stagedMetadata.push({
          id: randomUUID(),
          ticketId,
          autorId: actor.id,
          nombreOriginal: file.nombreOriginal,
          mimeType: file.mimeType,
          tamano: file.size,
          claveAlmacenada: key,
          fecha: this.clock.ahora().toISOString(),
        });
      }

      saved = await this.unitOfWork.execute(async () => {
        await this.requireWritableTicket(ticketId, actor);
        this.ensureCapacity(await this.repository.listarPorTicket(ticketId), stagedMetadata);
        await this.unitOfWork.stage(async () => {
          await this.requireWritableTicket(ticketId, actor);
          this.ensureCapacity(await this.repository.listarPorTicket(ticketId), stagedMetadata);
        });
        for (const anexo of stagedMetadata) await this.repository.agregar(anexo);
        return stagedMetadata;
      });
    } catch (error) {
      const cleanupResults = await Promise.allSettled(
        storedKeys.map((key) => this.storage.eliminar(key)),
      );
      const cleanupErrors = cleanupResults
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) => result.reason);
      if (cleanupErrors.length > 0) {
        this.logger.error(`Falló la compensación de ${cleanupErrors.length} archivo(s) almacenado(s).`);
        throw new AggregateError(
          [error, ...cleanupErrors],
          'Falló la operación y no se pudieron eliminar todos los archivos temporales.',
        );
      }
      throw error;
    }
    this.logger.log(`Anexos agregados. Usuario: ${actor.id}; cantidad: ${saved.length}`);
    return Promise.all(saved.map((anexo) => this.toResponse(anexo)));
  }

  async list(
    ticketId: string,
    actor: TicketActor,
    pagination: ListAnexosDto,
  ): Promise<{ data: AnexoResponseDto[]; page: number; pageSize: number; total: number }> {
    await this.requireVisibleTicket(ticketId, actor);
    const all = (await this.repository.listarPorTicket(ticketId)).sort(
      (left, right) => left.fecha.localeCompare(right.fecha),
    );
    const offset = (pagination.page - 1) * pagination.pageSize;
    const page = all.slice(offset, offset + pagination.pageSize);
    return {
      data: await Promise.all(page.map((item) => this.toResponse(item))),
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: all.length,
    };
  }

  async download(
    ticketId: string,
    anexoId: string,
    actor: TicketActor,
  ): Promise<DownloadableAttachment> {
    await this.requireVisibleTicket(ticketId, actor);
    const anexo = await this.repository.buscarPorId(ticketId, anexoId);
    if (!anexo) throw new NotFoundException('No se encontró el archivo solicitado.');
    try {
      return {
        metadata: await this.toResponse(anexo),
        contents: await this.storage.leer(anexo.claveAlmacenada),
      };
    } catch (error) {
      if (error instanceof StoredFileNotFoundError) {
        throw new NotFoundException('No se encontró el archivo solicitado.');
      }
      throw error;
    }
  }

  private async requireVisibleTicket(ticketId: string, actor: TicketActor) {
    const ticket = await this.ticketsRepository.findById(ticketId);
    if (!ticket || !(await this.visibility.canSee(actor, ticket))) {
      throw new NotFoundException('No se encontró el ticket solicitado.');
    }
    return ticket;
  }

  private async requireWritableTicket(ticketId: string, actor: TicketActor) {
    const ticket = await this.requireVisibleTicket(ticketId, actor);
    if (ticket.estado === TicketStatus.CERRADO) {
      throw new ConflictException('No se pueden agregar anexos a un ticket cerrado.');
    }
    return ticket;
  }

  private ensureCapacity(existing: Anexo[], incoming: Anexo[]): void {
    const count = existing.length + incoming.length;
    const totalBytes =
      existing.reduce((total, anexo) => total + anexo.tamano, 0) +
      incoming.reduce((total, anexo) => total + anexo.tamano, 0);
    const maxCount = this.config.get<number>('ANEXOS_MAX_POR_TICKET', 50);
    const maxBytes = this.config.get<number>('ANEXOS_MAX_BYTES_POR_TICKET', 52_428_800);
    if (count > maxCount) {
      throw new ConflictException(`El ticket alcanzó el límite de ${maxCount} anexos.`);
    }
    if (totalBytes > maxBytes) {
      throw new ConflictException('El ticket alcanzó el límite de almacenamiento para anexos.');
    }
  }

  private async toResponse(anexo: Anexo): Promise<AnexoResponseDto> {
    const user = await this.usuariosRepository.findById(anexo.autorId);
    return {
      id: anexo.id,
      ticketId: anexo.ticketId,
      autorId: anexo.autorId,
      autorNombre: user?.nombre ?? 'Usuario desconocido',
      nombreOriginal: anexo.nombreOriginal,
      mimeType: anexo.mimeType,
      tamano: anexo.tamano,
      fecha: anexo.fecha,
    };
  }
}
