import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer, connect } from 'node:net';
import { join } from 'node:path';
import autocannon from 'autocannon';

const root = process.cwd();
const build = spawnSync(
  process.execPath,
  [join(root, 'node_modules', '@nestjs', 'cli', 'bin', 'nest.js'), 'build'],
  { cwd: root, stdio: 'inherit' },
);
if (build.status !== 0) process.exit(build.status ?? 1);

const port = await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    if (!address || typeof address === 'string') {
      reject(new Error('No se pudo reservar un puerto local.'));
      return;
    }
    probe.close((error) => (error ? reject(error) : resolve(address.port)));
  });
});

const server = spawn(process.execPath, [join(root, 'dist', 'main.js')], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(port),
    JWT_SECRET: 'load-test-secret-that-is-long-enough-for-hmac-validation',
    ADMIN_NAME: 'Administrador de carga',
    ADMIN_EMAIL: 'load-admin@example.com',
    ADMIN_PASSWORD: 'LoadTestAdmin123',
    SLA_TIMEZONE: 'America/Mexico_City',
    PORTAL_PUBLICO_URL: 'http://localhost:3000',
    MAIL_TRANSPORT: 'consola',
    IMAP_HOST: 'localhost',
    IMAP_PORT: '1143',
    IMAP_USER: 'dev',
    IMAP_PASS: 'dev',
    IMAP_MAILBOX: 'INBOX',
    TRUST_PROXY: 'false',
  },
});

const baseUrl = `http://127.0.0.1:${port}`;
async function waitUntilListening() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`El servidor de carga terminó con código ${server.exitCode}.`);
    }
    const connected = await new Promise((resolve) => {
      const socket = connect(port, '127.0.0.1');
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => resolve(false));
    });
    if (connected) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('El servidor no abrió el puerto dentro del tiempo esperado.');
}

async function json(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`La API devolvió JSON inválido para ${method} ${path}.`);
  }
  if (!response.ok) {
    throw new Error(`${method} ${path}: HTTP ${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

async function benchmark(name, path, options = {}) {
  const responseTimes = [];
  const result = await new Promise((resolve, reject) => {
    const instance = autocannon(
      {
        url: `${baseUrl}${path}`,
        connections: 30,
        amount: 30,
        pipelining: 1,
        ...options,
      },
      (error, report) => (error ? reject(error) : resolve(report)),
    );
    instance.on('response', (_client, _statusCode, _bytes, responseTime) => {
      responseTimes.push(responseTime);
    });
  });
  responseTimes.sort((left, right) => left - right);
  const p95 = responseTimes[Math.ceil(responseTimes.length * 0.95) - 1] ?? 0;
  const statusCounts = Object.entries(result.statusCodeStats ?? {})
    .map(([status, stats]) => `${status}:${stats.count}`)
    .join(', ');
  console.log(
    `${name}: requests=${result.requests.total}, p95=${p95}ms, ` +
      `throughput=${result.throughput.average}B/s, status=[${statusCounts || 'sin datos'}]`,
  );
}

try {
  await waitUntilListening();
  const openApiResponse = await fetch(`${baseUrl}/api/docs-json`);
  if (!openApiResponse.ok) {
    throw new Error(`OpenAPI no respondió en /api/docs-json: HTTP ${openApiResponse.status}.`);
  }
  const openApi = await openApiResponse.json();
  const ticketSchema = openApi.components?.schemas?.CreateTicketDto;
  const publicOperation = openApi.paths?.['/api/publico/consulta']?.post;
  const areaReadOperation = openApi.paths?.['/api/areas']?.get;
  if (
    Object.keys(ticketSchema?.properties ?? {}).length === 0 ||
    publicOperation?.security ||
    !publicOperation?.description?.includes('Acceso: público') ||
    !areaReadOperation?.description?.includes('Roles permitidos') ||
    !openApi.components?.schemas?.ApiErrorResponse
  ) {
    throw new Error('El documento OpenAPI no contiene schemas, roles y respuestas completas.');
  }
  console.log(
    `OpenAPI: ${Object.keys(openApi.paths ?? {}).length} rutas, DTOs y políticas de acceso documentados.`,
  );
  const admin = await json('/api/auth/login', {
    method: 'POST',
    body: { correo: 'load-admin@example.com', password: 'LoadTestAdmin123' },
  });
  const adminToken = admin.access_token;
  const areas = await json('/api/areas', { token: adminToken });
  const categories = await json('/api/categorias', { token: adminToken });
  const areaId = areas[0]?.id;
  const category = categories.find((item) => item.activa);
  if (!areaId || !category) {
    throw new Error('La instancia no contiene un área y una categoría activa de prueba.');
  }
  await json('/api/usuarios', {
    method: 'POST',
    token: adminToken,
    body: {
      nombre: 'Agente de carga',
      correo: 'load-agent@example.com',
      password: 'LoadTestAgent123',
      rol: 'AGENTE',
      areaId,
    },
  });
  const agent = await json('/api/auth/login', {
    method: 'POST',
    body: { correo: 'load-agent@example.com', password: 'LoadTestAgent123' },
  });
  const agentToken = agent.access_token;
  const ticket = await json('/api/tickets', {
    method: 'POST',
    token: agentToken,
    body: {
      tipo: 'INC',
      titulo: 'Ticket de carga inicial',
      descripcion: 'Ticket creado para medir el endpoint del portal.',
      categoriaId: category.id,
      prioridad: 'BAJA',
      canal: 'CHAT',
      solicitanteNombre: 'Solicitante de carga',
      solicitanteCorreo: 'load-requester@example.com',
    },
  });

  await benchmark('login', '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      correo: 'load-agent@example.com',
      password: 'LoadTestAgent123',
    }),
  });
  await benchmark('listado de tickets', '/api/tickets', {
    headers: { authorization: `Bearer ${agentToken}` },
  });
  await benchmark('creación de tickets', '/api/tickets', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${agentToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      tipo: 'INC',
      titulo: 'Ticket de carga concurrente',
      descripcion: 'Petición sintética para la prueba de carga local.',
      categoriaId: category.id,
      prioridad: 'BAJA',
      canal: 'CHAT',
      solicitanteNombre: 'Solicitante de carga',
      solicitanteCorreo: 'load-requester@example.com',
    }),
  });
  await benchmark('consulta pública', '/api/publico/consulta', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      numeroCaso: ticket.numero,
      correo: 'load-requester@example.com',
    }),
  });
  await benchmark(
    'área sugerida',
    `/api/categorias/${category.id}/area-sugerida`,
    { headers: { authorization: `Bearer ${agentToken}` } },
  );
} finally {
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await once(server, 'exit');
  }
}
