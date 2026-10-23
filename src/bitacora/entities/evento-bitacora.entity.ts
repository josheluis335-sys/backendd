export enum EventoBitacoraTipo {
  CREACION = 'CREACION',
  NOTIFICACION_ENVIADA = 'NOTIFICACION_ENVIADA',
  NOTIFICACION_FALLIDA = 'NOTIFICACION_FALLIDA',
  PAUSA = 'PAUSA',
  REANUDACION = 'REANUDACION',
  ESCALAMIENTO = 'ESCALAMIENTO',
  CIERRE = 'CIERRE',
}

export type DetalleBitacora = Readonly<
  Record<string, string | number | boolean | null>
>;

export interface EventoBitacora {
  id: string;
  ticketId: string;
  tipo: EventoBitacoraTipo;
  detalle: DetalleBitacora;
  usuarioId?: string;
  fecha: string;
}
