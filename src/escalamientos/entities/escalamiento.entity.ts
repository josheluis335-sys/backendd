export interface Escalamiento {
  id: string;
  ticketId: string;
  areaId: string;
  asignadoPorId: string;
  recibidoPorId?: string;
  fecha: string;
  comentario: string;
}
