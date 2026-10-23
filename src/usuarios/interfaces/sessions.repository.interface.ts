import { Session } from '../entities/session.entity.js';

export interface SessionsRepository {
  create(session: Session): Promise<void>;
  findById(id: string): Promise<Session | null>;
  updateActivity(id: string, ultimaActividad: Date): Promise<void>;
  remove(id: string): Promise<void>;
  removeByUserId(userId: string): Promise<void>;
}
