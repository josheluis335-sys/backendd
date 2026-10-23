export interface MailboxMessage {
  uid: string;
  messageId?: string | null;
  remitenteNombre?: string | null;
  remitenteCorreo?: string | null;
  asunto?: string | null;
  cuerpo?: string | null;
  fechaRecepcion?: Date | null;
  tamanoExcedido?: boolean;
  fromMultipleOrInvalid?: boolean;
  headers?: Record<string, string | undefined>;
}

export interface MailboxReader {
  readUnread(): Promise<MailboxMessage[]>;
  markAsRead(uid: string): Promise<void>;
}
