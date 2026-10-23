import { TicketStatus } from '../entities/ticket.entity.js';

export const TicketMachineStatus = TicketStatus;
export type TicketMachineStatus = TicketStatus;

export enum TicketAction {
  ESCALAR = 'ESCALAR',
  PAUSAR = 'PAUSAR',
  REANUDAR = 'REANUDAR',
  CERRAR = 'CERRAR',
}

export class TicketStateTransitionError extends Error {
  readonly httpStatus = 409;

  constructor(message: string) {
    super(message);
    this.name = 'TicketStateTransitionError';
  }
}

export function transitionTicketState(
  estado: TicketMachineStatus,
  accion: TicketAction,
  estadoAntesDePausa?: TicketMachineStatus,
): TicketMachineStatus {
  if (estado === TicketMachineStatus.CERRADO) {
    throw new TicketStateTransitionError('Un ticket cerrado no puede cambiar de estado.');
  }

  if (estado === TicketMachineStatus.EN_PAUSA) {
    if (
      accion === TicketAction.REANUDAR &&
      (estadoAntesDePausa === TicketMachineStatus.NUEVO ||
        estadoAntesDePausa === TicketMachineStatus.ESCALADO)
    ) {
      return estadoAntesDePausa;
    }
    if (accion === TicketAction.CERRAR) {
      throw new TicketStateTransitionError('Reanuda el ticket antes de cerrarlo.');
    }
    if (accion === TicketAction.ESCALAR) {
      throw new TicketStateTransitionError('Reanuda el ticket antes de escalarlo.');
    }
    throw new TicketStateTransitionError(
      'La acción no está permitida mientras el ticket está en pausa; primero debes reanudarlo.',
    );
  }

  if (accion === TicketAction.ESCALAR && estado === TicketMachineStatus.NUEVO) {
    return TicketMachineStatus.ESCALADO;
  }
  if (accion === TicketAction.ESCALAR && estado === TicketMachineStatus.ESCALADO) {
    return TicketMachineStatus.ESCALADO;
  }
  if (accion === TicketAction.PAUSAR) {
    return TicketMachineStatus.EN_PAUSA;
  }
  if (accion === TicketAction.CERRAR) {
    return TicketMachineStatus.CERRADO;
  }
  throw new TicketStateTransitionError(
    'La acción no es válida para el estado actual del ticket.',
  );
}
