import { Injectable } from '@nestjs/common';
import { TicketType } from '../entities/ticket.entity.js';

@Injectable()
export class TicketCounterService {
  private readonly counters = new Map<TicketType, number>([
    [TicketType.INC, 0],
    [TicketType.REQ, 0],
  ]);

  next(type: TicketType): number {
    const nextValue = (this.counters.get(type) ?? 0) + 1;
    this.counters.set(type, nextValue);
    return nextValue;
  }

  format(type: TicketType, consecutive: number): string {
    return `${type}${String(consecutive).padStart(4, '0')}`;
  }
}
