import { TicketType } from '../entities/ticket.entity.js';
import { TicketCounterService } from './ticket-counter.service.js';

describe('TicketCounterService', () => {
  it('keeps independent counters and preserves minimum four-digit formatting', () => {
    const counter = new TicketCounterService();
    expect(counter.format(TicketType.INC, counter.next(TicketType.INC))).toBe('INC0001');
    expect(counter.format(TicketType.REQ, counter.next(TicketType.REQ))).toBe('REQ0001');
    expect(counter.format(TicketType.INC, counter.next(TicketType.INC))).toBe('INC0002');
    expect(counter.format(TicketType.INC, 10_000)).toBe('INC10000');
  });

  it('allocates unique consecutive numbers to fifty concurrent creations', async () => {
    const counter = new TicketCounterService();
    const numbers = await Promise.all(
      Array.from({ length: 50 }, async () => counter.next(TicketType.INC)),
    );
    expect([...numbers].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 50 }, (_, index) => index + 1),
    );
  });
});
