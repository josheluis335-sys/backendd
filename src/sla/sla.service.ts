import { Inject, Injectable } from '@nestjs/common';
import { ClockService } from '../common/clock/clock.service.js';
import { Ticket, TicketStatus } from '../tickets/entities/ticket.entity.js';
import { calcularSegundosHabiles } from './business-time.js';
import { SLA_CONFIG } from './sla.constants.js';
import type { SlaConfig } from './sla.config.js';
import { SlaState } from './sla-state.enum.js';

export { SlaState } from './sla-state.enum.js';

export interface TicketSla {
  limiteHoras: number;
  consumidoHoras: number;
  restanteHoras: number;
  excedidoHoras: number;
  porcentajeConsumido: number;
  estado: SlaState;
  detenido: boolean;
  calculoLimitado: boolean;
}

@Injectable()
export class SlaService {
  constructor(
    @Inject(SLA_CONFIG) private readonly config: SlaConfig,
    private readonly clock: ClockService,
  ) {}

  calcular(ticket: Ticket): TicketSla {
    const now = this.clock.ahora();
    const finish =
      ticket.estado === TicketStatus.CERRADO && ticket.fechaCierre
        ? ticket.fechaCierre
        : now;
    const limiteHoras = this.config.limitesHoras[ticket.tipo][ticket.prioridad];
    const limitSeconds = limiteHoras * 3600;
    let consumedSeconds: number;
    let calculoLimitado = false;
    try {
      consumedSeconds = calcularSegundosHabiles(ticket.fechaCreacion, finish, this.config);
      consumedSeconds -= ticket.tiempoPausaHabilAcumuladoSeg;
      if (ticket.estado === TicketStatus.EN_PAUSA && ticket.pausaInicio) {
        consumedSeconds -= calcularSegundosHabiles(ticket.pausaInicio, finish, this.config);
      }
      consumedSeconds = Math.max(0, consumedSeconds);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      calculoLimitado = true;
      consumedSeconds = limitSeconds + 1;
    }

    const isClosed = ticket.estado === TicketStatus.CERRADO;
    const estado =
      consumedSeconds > limitSeconds
        ? SlaState.VENCIDO
        : !isClosed && consumedSeconds >= limitSeconds * this.config.umbralProximo
          ? SlaState.PROXIMO_A_VENCER
          : SlaState.DENTRO_DEL_PLAZO;

    return {
      limiteHoras,
      consumidoHoras: roundHours(consumedSeconds / 3600),
      restanteHoras: roundHours(Math.max(0, limitSeconds - consumedSeconds) / 3600),
      excedidoHoras: roundHours(Math.max(0, consumedSeconds - limitSeconds) / 3600),
      porcentajeConsumido: roundHours((consumedSeconds / limitSeconds) * 100),
      estado,
      detenido: ticket.estado === TicketStatus.EN_PAUSA || isClosed,
      calculoLimitado,
    };
  }

  calcularSegundosHabiles(inicio: Date, fin: Date): number {
    return calcularSegundosHabiles(inicio, fin, this.config);
  }
}

function roundHours(hours: number): number {
  return Math.round((hours + Number.EPSILON) * 100) / 100;
}
