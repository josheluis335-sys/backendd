import {
  TicketAction,
  TicketMachineStatus,
  TicketStateTransitionError,
  transitionTicketState,
} from './ticket-state-machine.js';

describe('ticket state machine', () => {
  it.each([
    ['NUEVO escala a ESCALADO', TicketMachineStatus.NUEVO, TicketAction.ESCALAR, undefined, TicketMachineStatus.ESCALADO],
    ['NUEVO pausa', TicketMachineStatus.NUEVO, TicketAction.PAUSAR, undefined, TicketMachineStatus.EN_PAUSA],
    ['NUEVO cierra', TicketMachineStatus.NUEVO, TicketAction.CERRAR, undefined, TicketMachineStatus.CERRADO],
    ['ESCALADO permite reescalar', TicketMachineStatus.ESCALADO, TicketAction.ESCALAR, undefined, TicketMachineStatus.ESCALADO],
    ['ESCALADO pausa', TicketMachineStatus.ESCALADO, TicketAction.PAUSAR, undefined, TicketMachineStatus.EN_PAUSA],
    ['ESCALADO cierra', TicketMachineStatus.ESCALADO, TicketAction.CERRAR, undefined, TicketMachineStatus.CERRADO],
    ['EN_PAUSA reanuda a NUEVO', TicketMachineStatus.EN_PAUSA, TicketAction.REANUDAR, TicketMachineStatus.NUEVO, TicketMachineStatus.NUEVO],
    ['EN_PAUSA reanuda a ESCALADO', TicketMachineStatus.EN_PAUSA, TicketAction.REANUDAR, TicketMachineStatus.ESCALADO, TicketMachineStatus.ESCALADO],
  ])('%s', (_name, state, action, previous, result) => {
    expect(transitionTicketState(state, action, previous)).toBe(result);
  });

  it.each([
    ['NUEVO no puede reanudar', TicketMachineStatus.NUEVO, TicketAction.REANUDAR],
    ['ESCALADO no puede reanudar', TicketMachineStatus.ESCALADO, TicketAction.REANUDAR],
    ['EN_PAUSA no puede escalar', TicketMachineStatus.EN_PAUSA, TicketAction.ESCALAR],
    ['EN_PAUSA no puede pausar otra vez', TicketMachineStatus.EN_PAUSA, TicketAction.PAUSAR],
    ['EN_PAUSA no puede cerrar sin reanudar', TicketMachineStatus.EN_PAUSA, TicketAction.CERRAR],
    ['EN_PAUSA necesita estado previo para reanudar', TicketMachineStatus.EN_PAUSA, TicketAction.REANUDAR],
    ['CERRADO no puede escalar', TicketMachineStatus.CERRADO, TicketAction.ESCALAR],
    ['CERRADO no puede pausar', TicketMachineStatus.CERRADO, TicketAction.PAUSAR],
    ['CERRADO no puede reanudar', TicketMachineStatus.CERRADO, TicketAction.REANUDAR],
    ['CERRADO es terminal', TicketMachineStatus.CERRADO, TicketAction.CERRAR],
  ])('%s', (_name, state, action) => {
    expect(() => transitionTicketState(state, action)).toThrow(TicketStateTransitionError);
  });
});
