export enum ComunicacionEstado {
  PENDIENTE = 'PENDIENTE',
  DESCARTADO = 'DESCARTADO',
  CONVERTIDO = 'CONVERTIDO',
}

export interface Comunicacion {
  id: string;
  messageId: string;
  remitenteNombre: string;
  remitenteCorreo: string;
  asunto: string;
  cuerpo: string;
  fechaRecepcion: Date;
  ingresadoEn: Date;
  estado: ComunicacionEstado;
  motivoDescarte: string | null;
  ticketId: string | null;
}
