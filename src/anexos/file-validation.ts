import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';

export interface IncomingAttachment {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface ValidatedAttachment extends IncomingAttachment {
  nombreOriginal: string;
  mimeType: string;
}

const ALLOWED_TYPES: Record<string, { mime: string; signature: (buffer: Buffer) => boolean }> = {
  '.pdf': {
    mime: 'application/pdf',
    signature: (buffer) => buffer.subarray(0, 5).toString('ascii') === '%PDF-',
  },
  '.png': {
    mime: 'image/png',
    signature: (buffer) =>
      buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  },
  '.jpg': {
    mime: 'image/jpeg',
    signature: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  },
  '.jpeg': {
    mime: 'image/jpeg',
    signature: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  },
  '.txt': {
    mime: 'text/plain',
    signature: (buffer) => isUtf8Text(buffer) && !buffer.includes(0),
  },
  '.csv': {
    mime: 'text/csv',
    signature: (buffer) => isUtf8Text(buffer) && !buffer.includes(0),
  },
  '.docx': {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    signature: (buffer) => validateOfficeZip(buffer, 'word/document.xml'),
  },
  '.xlsx': {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    signature: (buffer) => validateOfficeZip(buffer, 'xl/workbook.xml'),
  },
  '.pptx': {
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    signature: (buffer) => validateOfficeZip(buffer, 'ppt/presentation.xml'),
  },
};

export function validateAttachments(
  files: IncomingAttachment[],
  maxFileSize: number,
): ValidatedAttachment[] {
  if (files.length === 0) throw new BadRequestException('Debes adjuntar al menos un archivo.');
  return files.map((file) => {
    if (file.size > maxFileSize) {
      throw new PayloadTooLargeException('Cada archivo debe pesar como máximo 10 MB.');
    }
    if (file.size !== file.buffer.length || file.size === 0) {
      throw new BadRequestException('El archivo está vacío o su tamaño no es válido.');
    }
    const nombreOriginal = sanitizeFilename(file.originalname);
    const extension = extensionOf(nombreOriginal);
    const type = ALLOWED_TYPES[extension];
    if (!type || !type.signature(file.buffer)) {
      throw new BadRequestException(
        'Tipo de archivo no permitido o contenido que no coincide con su extensión.',
      );
    }
    return { ...file, nombreOriginal, mimeType: type.mime };
  });
}

export function sanitizeFilename(filename: string): string {
  if (filename.includes('/') || filename.includes('\\')) {
    throw new BadRequestException('El nombre del archivo no debe contener rutas.');
  }
  const basename = filename.normalize('NFC').trim();
  if (
    basename.length === 0 ||
    basename.length > 180 ||
    basename === '.' ||
    basename === '..' ||
    Array.from(basename).some((character) => {
      const code = character.codePointAt(0);
      return code !== undefined && (code < 32 || code === 127);
    })
  ) {
    throw new BadRequestException('El nombre del archivo no es válido.');
  }
  const parts = basename.toLowerCase().split('.');
  const finalExtension = parts.at(-1);
  if (
    parts.length > 2 &&
    ['php', 'exe', 'com', 'bat', 'cmd', 'js', 'html', 'svg', 'sh'].includes(
      parts.at(-2) ?? '',
    )
  ) {
    throw new BadRequestException('No se permiten nombres de archivo con doble extensión ejecutable.');
  }
  if (['php', 'exe', 'com', 'bat', 'cmd', 'js', 'html', 'svg', 'sh'].includes(finalExtension ?? '')) {
    throw new BadRequestException('La extensión del archivo no está permitida.');
  }
  return basename;
}

function extensionOf(filename: string): string {
  const separator = filename.lastIndexOf('.');
  return separator < 0 ? '' : filename.slice(separator).toLowerCase();
}

function isUtf8Text(buffer: Buffer): boolean {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return !Array.from(text).some((character) => {
      const code = character.codePointAt(0);
      return (
        code !== undefined &&
        ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127)
      );
    });
  } catch {
    return false;
  }
}

function validateOfficeZip(buffer: Buffer, requiredEntry: string): boolean {
  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd < 0 || buffer.length < eocd + 22) return false;
  const diskNumber = buffer.readUInt16LE(eocd + 4);
  const directoryDisk = buffer.readUInt16LE(eocd + 6);
  const diskEntryCount = buffer.readUInt16LE(eocd + 8);
  const count = buffer.readUInt16LE(eocd + 10);
  const directorySize = buffer.readUInt32LE(eocd + 12);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  const commentLength = buffer.readUInt16LE(eocd + 20);
  if (
    diskNumber !== 0 ||
    directoryDisk !== 0 ||
    diskEntryCount !== count ||
    eocd + 22 + commentLength !== buffer.length ||
    count === 0xffff ||
    directorySize === 0xffffffff ||
    directoryOffset === 0xffffffff ||
    count > 2000 ||
    directoryOffset + directorySize !== eocd
  ) {
    throw new BadRequestException('El archivo Office contiene una estructura ZIP no admitida.');
  }

  let offset = directoryOffset;
  let uncompressedTotal = 0;
  let contentTypesFound = false;
  let requiredEntryFound = false;
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > eocd || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new BadRequestException('El archivo Office está dañado.');
    }
    const flags = buffer.readUInt16LE(offset + 8);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const filenameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const entryEnd = offset + 46 + filenameLength + extraLength + commentLength;
    if (
      entryEnd > eocd ||
      uncompressedSize === 0xffffffff ||
      (flags & 1) !== 0
    ) {
      throw new BadRequestException('El archivo Office contiene una entrada no admitida.');
    }
    const entryName = buffer
      .subarray(offset + 46, offset + 46 + filenameLength)
      .toString('utf8');
    if (entryName.toLowerCase().includes('vbaproject.bin')) {
      throw new BadRequestException('No se permiten archivos Office con macros.');
    }
    requiredEntryFound ||= entryName === requiredEntry;
    contentTypesFound ||= entryName === '[Content_Types].xml';
    uncompressedTotal += uncompressedSize;
    if (uncompressedTotal > 209_715_200) {
      throw new PayloadTooLargeException('El contenido descomprimido del archivo supera 200 MB.');
    }
    offset = entryEnd;
  }
  return requiredEntryFound && contentTypesFound;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minimum = Math.max(0, buffer.length - 65_557);
  for (let index = buffer.length - 22; index >= minimum; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) return index;
  }
  return -1;
}
