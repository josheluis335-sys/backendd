import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { sanitizeFilename, validateAttachments } from './file-validation.js';
import type { IncomingAttachment } from './file-validation.js';

function makeZip(entries: Array<{ name: string; declaredSize?: number }>): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    locals.push(local);

    const directoryEntry = Buffer.alloc(46 + name.length);
    directoryEntry.writeUInt32LE(0x02014b50, 0);
    directoryEntry.writeUInt32LE(entry.declaredSize ?? 0, 24);
    directoryEntry.writeUInt16LE(name.length, 28);
    name.copy(directoryEntry, 46);
    central.push(directoryEntry);
    localOffset += local.length;
  }

  const centralDirectory = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...locals, centralDirectory, eocd]);
}

function file(originalname: string, buffer: Buffer): IncomingAttachment {
  return { originalname, mimetype: 'application/octet-stream', size: buffer.length, buffer };
}

describe('attachment validation', () => {
  it('accepts valid UTF-8 TXT and CSV files', () => {
    const accepted = validateAttachments(
      [
        file('nota.txt', Buffer.from('Texto UTF-8: áéíóú\n')),
        file('datos.csv', Buffer.from('id,nombre\n1,José\n')),
      ],
      10_485_760,
    );
    expect(accepted.map(({ mimeType }) => mimeType)).toEqual(['text/plain', 'text/csv']);
  });

  it('rejects TXT files containing NUL bytes', () => {
    expect(() =>
      validateAttachments([file('nulo.txt', Buffer.from([0x61, 0x00, 0x62]))], 10_485_760),
    ).toThrow(BadRequestException);
  });

  it('rejects CSV files with invalid UTF-8 byte sequences', () => {
    expect(() =>
      validateAttachments([file('malformado.csv', Buffer.from([0xc3, 0x28]))], 10_485_760),
    ).toThrow(BadRequestException);
  });

  it('accepts the supported PNG/JPG, PDF, TXT/CSV, and Office formats by signature', () => {
    const docx = makeZip([{ name: '[Content_Types].xml' }, { name: 'word/document.xml' }]);
    const xlsx = makeZip([{ name: '[Content_Types].xml' }, { name: 'xl/workbook.xml' }]);
    const pptx = makeZip([{ name: '[Content_Types].xml' }, { name: 'ppt/presentation.xml' }]);
    const inputs = [
      file('informe.pdf', Buffer.from('%PDF-1.7 contenido')),
      file('imagen.png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0])),
      file('foto.jpg', Buffer.from([0xff, 0xd8, 0xff, 0x00])),
      file('nota.txt', Buffer.from('texto UTF-8\n')),
      file('datos.csv', Buffer.from('id,nombre\n1,José\n')),
      file('documento.docx', docx),
      file('libro.xlsx', xlsx),
      file('presentacion.pptx', pptx),
    ];
    const accepted = validateAttachments(inputs, 10_485_760);

    expect(accepted.map(({ mimeType }) => mimeType)).toEqual([
      'application/pdf',
      'image/png',
      'image/jpeg',
      'text/plain',
      'text/csv',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ]);
  });

  it('rejects extension spoofing, path/control names, oversized files, and macro-enabled Office zips', () => {
    expect(() => validateAttachments([file('renombrado.pdf', Buffer.from('MZ'))], 10_485_760))
      .toThrow(BadRequestException);
    expect(() => sanitizeFilename('../informe.pdf')).toThrow(BadRequestException);
    expect(() => sanitizeFilename('x.php.pdf')).toThrow(BadRequestException);
    expect(() => sanitizeFilename('x.pdf.exe')).toThrow(BadRequestException);
    expect(() => validateAttachments([file('imagen.gif', Buffer.from('GIF89a'))], 10_485_760))
      .toThrow(BadRequestException);
    expect(() => validateAttachments([file('imagen.webp', Buffer.from('RIFF'))], 10_485_760))
      .toThrow(BadRequestException);
    expect(() => validateAttachments([file('imagen.svg', Buffer.from('<svg/>'))], 10_485_760))
      .toThrow(BadRequestException);
    expect(() => sanitizeFilename(`nombre${String.fromCharCode(1)}.pdf`))
      .toThrow(BadRequestException);
    expect(() =>
      validateAttachments([file('grande.pdf', Buffer.alloc(10_485_761, 1))], 10_485_760),
    ).toThrow(PayloadTooLargeException);
    expect(() =>
      validateAttachments([file('nulo.txt', Buffer.from([0x61, 0x00, 0x62]))], 10_485_760),
    ).toThrow(BadRequestException);
    expect(() =>
      validateAttachments([file('malformado.csv', Buffer.from([0xc3, 0x28]))], 10_485_760),
    ).toThrow(BadRequestException);
    const macro = makeZip([
      { name: '[Content_Types].xml' },
      { name: 'word/document.xml' },
      { name: 'word/vbaProject.bin' },
    ]);
    expect(() => validateAttachments([file('macro.docx', macro)], 10_485_760))
      .toThrow(BadRequestException);
  });

  it('rejects Office ZIP archives with more than 2000 entries or excessive declared expansion', () => {
    const tooManyEntries = makeZip(
      Array.from({ length: 2001 }, (_, index) => ({ name: `entry-${index}` })),
    );
    expect(() => validateAttachments([file('many.docx', tooManyEntries)], 10_485_760))
      .toThrow(BadRequestException);
    const oversized = makeZip([
      { name: '[Content_Types].xml', declaredSize: 209_715_201 },
      { name: 'word/document.xml' },
    ]);
    expect(() => validateAttachments([file('large.docx', oversized)], 10_485_760))
      .toThrow(PayloadTooLargeException);
  });
});
