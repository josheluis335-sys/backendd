import { NotFoundException } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { TicketPriority, TicketStatus, TicketType } from '../tickets/entities/ticket.entity.js';
import { PublicTicketResponseDto } from './dto/public-ticket-response.dto.js';
import { compareEmailConstantTime, normalizeLookupInput, PublicoService } from './publico.service.js';
import { PUBLIC_LOOKUP_NOT_FOUND } from './publico.constants.js';

const ticket = {
  id: 'private-id',
  version: 4,
  numero: 'INC0001',
  tipo: TicketType.INC,
  estado: TicketStatus.NUEVO,
  fechaUltimaActualizacion: new Date('2026-10-23T12:00:00.000Z'),
  solicitanteCorreo: 'person@example.com',
  titulo: 'secret title',
  descripcion: 'secret description',
  prioridad: TicketPriority.ALTA,
  solucion: 'secret solution',
  areaActualId: 'private-area',
  anotaciones: ['private note'],
  anexos: ['private file'],
  sla: { estado: 'VENCIDO' },
};

function createService(options: {
  found?: boolean;
  compare?: (expected: string, received: string) => boolean;
  blocked?: boolean;
} = {}) {
  const lookup = {
    buscarPorNumero: vi.fn().mockResolvedValue(options.found === false ? null : ticket),
  };
  const attempts = {
    blocked: vi.fn().mockReturnValue({
      blocked: options.blocked ?? false,
      retryAfterSeconds: 300,
    }),
    failure: vi.fn().mockReturnValue({ blocked: false, retryAfterSeconds: 0 }),
    success: vi.fn(),
  };
  const compare = options.compare ?? compareEmailConstantTime;
  const service = new PublicoService(
    lookup as never,
    attempts as never,
    {} as never,
    compare,
  );
  return { service, lookup, attempts };
}

describe('PublicoService', () => {
  it('normalizes case number and email and tracks invalid input without a DTO validation error', () => {
    expect(
      normalizeLookupInput({ numeroCaso: ' inc 0001 ', correo: ' Person @Example.com ' }),
    ).toMatchObject({
      numeroCaso: 'INC0001',
      correo: 'person@example.com',
      numeroValido: true,
      correoValido: true,
    });
    expect(
      normalizeLookupInput({ numeroCaso: 123, correo: null }),
    ).toMatchObject({
      numeroCaso: '',
      correo: '',
      numeroValido: false,
      correoValido: false,
    });
  });

  it('returns exactly the four public allow-listed fields for any ticket status', async () => {
    const { service } = createService();
    const result = await service.consultar('127.0.0.1', {
      numeroCaso: 'INC0001',
      correo: 'person@example.com',
    });
    expect(result).toBeInstanceOf(PublicTicketResponseDto);
    expect(Object.keys(result).sort()).toEqual([
      'estado',
      'fechaUltimaActualizacion',
      'numero',
      'tipo',
    ]);
    expect(result.estado).toBe(TicketStatus.NUEVO);
  });

  it('does one constant-time comparison for nonexistent cases and incorrect email', async () => {
    const comparator = vi.fn(compareEmailConstantTime);
    const missing = createService({ found: false, compare: comparator });
    const incorrect = createService({ compare: comparator });
    await expect(
      missing.service.consultar('ip-a', {
        numeroCaso: 'INC9999',
        correo: 'person@example.com',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    const missingCalls = comparator.mock.calls.length;
    comparator.mockClear();
    await expect(
      incorrect.service.consultar('ip-b', {
        numeroCaso: 'INC0001',
        correo: 'wrong@example.com',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(missingCalls).toBe(1);
    expect(comparator).toHaveBeenCalledTimes(missingCalls);
    expect(missing.lookup.buscarPorNumero).toHaveBeenCalledTimes(1);
    expect(incorrect.lookup.buscarPorNumero).toHaveBeenCalledTimes(1);
  });

  it('uses timingSafeEqual over fixed-size SHA-256 digests', () => {
    expect(compareEmailConstantTime('person@example.com', 'person@example.com')).toBe(true);
    expect(compareEmailConstantTime('person@example.com', 'wrong@example.com')).toBe(false);
  });

  it('returns one generic not-found response for invalid format, missing fields, and wrong types', async () => {
    const { service } = createService();
    for (const body of [
      { numeroCaso: 'bad', correo: 'person@example.com' },
      {},
      { numeroCaso: ['INC0001'], correo: { value: 'person@example.com' } },
    ]) {
      try {
        await service.consultar('ip-a', body);
        throw new Error('Expected public lookup to fail.');
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        expect((error as NotFoundException).message).toContain(PUBLIC_LOOKUP_NOT_FOUND);
      }
    }
  });

  it('does not log the submitted email when a lookup is blocked', async () => {
    const logger = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { service } = createService({ blocked: true });
    try {
      await expect(
        service.consultar('192.0.2.10', {
          numeroCaso: 'INC9999',
          correo: 'private.person@example.com',
        }),
      ).rejects.toThrow();
      expect(logger.mock.calls.flat().join(' ')).not.toContain('private.person@example.com');
      expect(logger.mock.calls.flat().join(' ')).not.toContain('INC9999');
    } finally {
      logger.mockRestore();
    }
  });
});
