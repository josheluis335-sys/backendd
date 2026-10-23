export interface MailMessage {
  para: string;
  asunto: string;
  texto: string;
  html: string;
  headers?: Record<string, string>;
}

export interface MailerResult {
  accepted: boolean;
}

export interface MailerService {
  enviar(message: MailMessage): Promise<MailerResult>;
}
