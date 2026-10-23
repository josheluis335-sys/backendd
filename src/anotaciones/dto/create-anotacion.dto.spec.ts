import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAnotacionDto } from './create-anotacion.dto.js';

describe('CreateAnotacionDto', () => {
  it('trims text and rejects blank, oversized, or control-character content', async () => {
    const trimmed = plainToInstance(CreateAnotacionDto, { texto: '  nota interna  ' });
    expect(trimmed.texto).toBe('nota interna');
    expect(await validate(trimmed)).toHaveLength(0);

    const blank = plainToInstance(CreateAnotacionDto, { texto: '   ' });
    expect(await validate(blank)).not.toHaveLength(0);
    const oversized = plainToInstance(CreateAnotacionDto, { texto: 'x'.repeat(2001) });
    expect(await validate(oversized)).not.toHaveLength(0);
    const control = plainToInstance(CreateAnotacionDto, {
      texto: `nota${String.fromCharCode(1)}`,
    });
    expect(await validate(control)).not.toHaveLength(0);
  });
});
