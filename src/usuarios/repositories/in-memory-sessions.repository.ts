import { Injectable } from '@nestjs/common';
import { Session } from '../entities/session.entity.js';
import { SessionsRepository } from '../interfaces/sessions.repository.interface.js';

@Injectable()
export class InMemorySessionsRepository implements SessionsRepository {
  private readonly sessions = new Map<string, Session>();

  async create(session: Session): Promise<void> {
    this.sessions.set(session.id, structuredClone(session));
  }

  async findById(id: string): Promise<Session | null> {
    const session = this.sessions.get(id);
    return session ? structuredClone(session) : null;
  }

  async updateActivity(id: string, ultimaActividad: Date): Promise<void> {
    const session = this.sessions.get(id);
    if (session) {
      session.ultimaActividad = structuredClone(ultimaActividad);
    }
  }

  async remove(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  async removeByUserId(userId: string): Promise<void> {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.usuarioId === userId) {
        this.sessions.delete(sessionId);
      }
    }
  }
}
