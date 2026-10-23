export enum TicketType {
  INC = 'INC',
  REQ = 'REQ',
}

export enum TicketPriority {
  CRITICA = 'CRITICA',
  ALTA = 'ALTA',
  MEDIA = 'MEDIA',
  BAJA = 'BAJA',
}

export enum TicketChannel {
  CHAT = 'CHAT',
  LLAMADA = 'LLAMADA',
  CORREO = 'CORREO',
}

export enum TicketStatus {
  NUEVO = 'NUEVO',
  ESCALADO = 'ESCALADO',
  EN_PAUSA = 'EN_PAUSA',
  CERRADO = 'CERRADO',
}

export interface Ticket {
  id: string;
  version: number;
  tipo: TicketType;
  consecutivo: number;
  numero: string;
  titulo: string;
  descripcion: string;
  categoriaId: string;
  prioridad: TicketPriority;
  canal: TicketChannel;
  solicitanteNombre: string;
  solicitanteCorreo: string;
  estado: TicketStatus;
  areaActualId: string;
  creadoPorId: string;
  fechaCreacion: Date;
  fechaUltimaActualizacion: Date;
  tiempoPausaAcumuladoSeg: number;
  tiempoPausaHabilAcumuladoSeg: number;
  pausaInicio: Date | null;
  estadoAntesDePausa: TicketStatus.NUEVO | TicketStatus.ESCALADO | null;
  motivoPausa: string | null;
  solucion: string | null;
  fechaCierre: Date | null;
}
