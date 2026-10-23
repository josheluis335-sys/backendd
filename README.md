# Mesa de Servicio

Backend NestJS para la gestión de tickets, correo entrante/saliente y consulta
pública de casos. Todas las respuestas y mensajes de negocio están en español.
Las rutas de soporte requieren JWT salvo `POST /api/auth/login`,
`POST /api/publico/consulta` y `GET /api/salud`.

## Requisitos y arranque

- Node.js 24 o superior y npm.
- Copia `.env.example` a `.env`, sustituye todos los valores de ejemplo y usa
  un `JWT_SECRET` aleatorio de al menos 32 caracteres.
- El seed del administrador lee `ADMIN_NAME`, `ADMIN_EMAIL` y `ADMIN_PASSWORD`
  del entorno; no hay contraseña fija en el código.

```powershell
npm ci
npm run build
npm run start:dev
```

La aplicación falla al arrancar si falta una variable obligatoria, si un límite
numérico no es un entero positivo, si el secreto JWT es débil o conserva el
valor de ejemplo, o si la configuración de producción no cumple TLS/HTTPS.
`.env`, `.env.*` (salvo `.env.example`), `uploads/`, `credentials/` y
`secrets/` están excluidos de Git.

## Variables de entorno

| Variable | Uso / valor de desarrollo |
|---|---|
| `PORT`, `APP_NAME`, `NODE_ENV`, `TZ` | Puerto 3000, nombre, entorno y zona del proceso. |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Clave requerida (>=32 caracteres, sin valor de ejemplo) y expiración `8h`. |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_AREA_NOMBRE` | Seed; contraseña exclusiva de entorno. |
| `DEV_AGENT_*`, `DEV_SUPERVISOR_*` | Cuentas iniciales solo cuando `NODE_ENV=development`. |
| `SLA_TIMEZONE`, `SLA_HORA_INICIO`, `SLA_HORA_FIN`, `SLA_UMBRAL_PROXIMO`, `SLA_FESTIVOS`, `SLA_ALERT_PERCENT` | Horario IANA, ventana hábil, umbrales y festivos `AAAA-MM-DD`. |
| `MAIL_TRANSPORT` | `smtp` o `consola`; consola registra únicamente tipo y número del ticket. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Conexión saliente. En producción son obligatorias; certificado siempre verificado y STARTTLS requerido cuando `SMTP_SECURE=false`. |
| `MAIL_TIMEOUT_MS` | Timeout SMTP; 5000 ms por defecto. |
| `PORTAL_PUBLICO_URL` | URL base enviada en notificaciones; debe ser HTTPS en producción. |
| `NOTIFICACIONES_MAX_POR_TICKET` | Máximo de notificaciones exitosas; 20 por defecto. |
| `IMAP_HOST`, `IMAP_PORT`, `IMAP_SECURE`, `IMAP_USER`, `IMAP_PASS`, `IMAP_MAILBOX` | Buzón entrante. En producción todas son obligatorias y `IMAP_SECURE=true`. |
| `COMUNICACIONES_MAX_POR_REMITENTE_HORA` | 20 mensajes por remitente y ventana móvil de una hora. |
| `COMUNICACIONES_MAX_TOTAL` | 2000 comunicaciones pendientes de conversión. |
| `IMAP_MAX_BYTES_MENSAJE` | Máximo de bytes por mensaje: 5242880. |
| `CORREO_DOMINIOS_PERMITIDOS` | Dominios de remitente aceptados, separados por coma; vacío permite cualquier dominio. |
| `PORTAL_MAX_INTENTOS`, `PORTAL_BLOQUEO_MINUTOS`, `PORTAL_MAX_INTENTOS_POR_CASO`, `PORTAL_MAX_CLAVES` | 5 fallos, 5 minutos, 30 fallos por caso y 50000 claves por defecto. |
| `PORTAL_ORIGENES_PERMITIDOS`, `SUPPORT_CORS_ORIGINS` | Listas independientes de orígenes CORS del portal y de soporte. |
| `TRUST_PROXY` | `false` por defecto; activar solo detrás de un proxy inverso confiable y configurado. |
| `SWAGGER_ENABLED`, `SWAGGER_ALLOWED_IPS` | Swagger activo fuera de producción por defecto; en producción está apagado salvo habilitación explícita y allowlist de IP obligatoria. |
| `UPLOADS_DIR` | `./uploads`, fuera del directorio estático y excluido por Git. |
| `ANEXOS_MAX_POR_PETICION`, `ANEXOS_MAX_POR_TICKET`, `ANEXOS_MAX_BYTES_POR_TICKET`, `ANOTACIONES_MAX_POR_TICKET` | 5, 50, 52428800 y 200. Todos deben ser enteros positivos. |

## API y roles

Prefijo común: `/api`. Los guards JWT y de roles son globales y ordenados:
autenticación primero y autorización después. La cobertura de políticas falla si
una ruta no tiene `@Public()`, `@Roles(...)` o `@AnyRole()`.

| Rutas | Acceso |
|---|---|
| `POST /auth/login` | Público; limitación por IP y correo. |
| `GET /auth/me`, `POST /auth/logout` | Cualquier usuario autenticado. |
| `GET /areas`, `GET /categorias`, `GET /categorias/:id/area-sugerida` | Cualquier rol autenticado. |
| `POST/PATCH /areas`, `POST/PATCH /categorias` | ADMINISTRADOR. |
| `/usuarios` | ADMINISTRADOR, salvo directorio según política del controlador. |
| `POST/GET /tickets`, `GET /tickets/:id`, acciones | AGENTE y visibilidad por área/asignación; supervisores tienen lectura y cierre según política. |
| `GET /supervisor/tickets` | SUPERVISOR y ADMINISTRADOR; respeta visibilidad, SLA y paginación. |
| `/tickets/:id/anotaciones`, `/tickets/:id/anexos` | AGENTE puede crear; lectura según visibilidad y rol; SUPERVISOR/ADMINISTRADOR no crean. |
| `/tickets/:id/bitacora`, `/tickets/:id/escalamientos` | Lectura con autorización y visibilidad del ticket. |
| `/comunicaciones` | AGENTE; convertir es de una sola vez y atómico. |
| `POST /publico/consulta` | Público, POST únicamente, respuesta blanca de cuatro campos. |
| `GET /salud` | Público, responde `{ "estado": "ok" }` y tiene throttling. |

El documento OpenAPI, cuando está habilitado, está en `/api/docs`. En producción
la documentación queda apagada salvo configuración explícita de `SWAGGER_ENABLED`
y `SWAGGER_ALLOWED_IPS`.

## Seguridad y comportamiento

- El portal usa POST para no dejar correo/número en URL. Los errores de datos de
  consulta se uniforman en 404; el bloqueo responde 429 con `Retry-After`.
- Los intentos se contabilizan por IP+caso, IP y caso global. Un éxito solo
  reinicia IP+caso; no limpia los otros contadores. La IP no confía en
  `X-Forwarded-For` a menos que `TRUST_PROXY=true`.
- Si hay varias instancias, sustituir el almacén de intentos en memoria por
  Redis/base de datos. Considerar CAPTCHA ante abuso y configurar correctamente
  el proxy inverso antes de confiar en la IP reenviada.
- La respuesta pública solo incluye número, tipo, estado y fecha del último
  cambio de estado. No se actualiza esa fecha por anotaciones, anexos o avisos.
- Cargas de anexos validan contenido en servidor, almacenan bajo clave UUID
  opaca y nunca devuelven rutas. Límite fijo por archivo: 10 MiB. Antivirus y
  cifrado en reposo son pendientes de producción.
- `GET /api/salud` no expone versiones ni detalles de dependencias. Helmet está
  activo, se deshabilita `X-Powered-By` y la capa de soporte y portal mantiene
  CORS separado.
- Los datos de tickets, comunicaciones, usuarios y bitácora son InMemory:
  reiniciar el proceso los elimina. No usar esta persistencia como producción.

## Correo entrante/saliente en desarrollo

El lector IMAP usa solo el texto plano normalizado por `mailparser`; no guarda ni
devuelve HTML ni adjuntos. Los mensajes automáticos/rebotes se descartan y se
deduplican por `Message-ID` o huella estable.

Para probar manualmente SMTP/IMAP con GreenMail, con Docker instalado:

```powershell
docker compose -f docker-compose.dev.yml up -d
```

Los puertos SMTP `127.0.0.1:1025` e IMAP `127.0.0.1:1143` solo se publican en
loopback. Configura `MAIL_TRANSPORT=smtp`, `SMTP_HOST=localhost`,
`SMTP_PORT=1025`, `SMTP_SECURE=false`, `SMTP_USER=dev`, `SMTP_PASS=dev`,
`MAIL_FROM=no-reply@example.com`, `IMAP_HOST=localhost`, `IMAP_PORT=1143`,
`IMAP_SECURE=false`, `IMAP_USER=dev`, `IMAP_PASS=dev` y `IMAP_MAILBOX=INBOX`.
Inicia la API, crea un ticket desde la interfaz o `POST /api/tickets` y revisa
el buzón GreenMail con un cliente IMAP o su consola de pruebas. El mensaje de
creación contiene el número del caso y la URL base, nunca el título.

## Verificación y carga

```powershell
npm run build
npm run lint
npm test
npm run test:e2e
npm audit
npm run test:carga
```

La prueba de carga reconstruye y arranca una instancia local, prepara datos de
prueba y usa 30 conexiones concurrentes en login, listado, creación, consulta
pública y área sugerida. Reporta p95 y códigos HTTP; los límites de throttling y
la persistencia InMemory condicionan los resultados. No es un benchmark de
producción.

## Despliegue y trabajo pendiente

El contenedor se ejecuta como usuario no root, usa etapas de build/runtime y
requiere que secretos y volúmenes se inyecten fuera de la imagen. Antes de
producción:

1. Migrar repositorios InMemory a PostgreSQL con migraciones versionadas,
   transacciones para creación/conversión y control optimista de versión.
2. Migrar bitácora append-only con restricciones de integridad; almacenar
   adjuntos en object storage privado con retención/cifrado y antivirus.
3. Reemplazar la cola de notificaciones por cola persistente con reintentos e
   idempotencia y configurar SPF, DKIM y DMARC del dominio emisor.
4. Usar almacén distribuido para intentos del portal, configurar límites del
   proxy y monitorizar bloqueos sin registrar identificadores/correos sensibles.
5. Mantener secretos fuera de `.env` en producción (gestor de secretos), revisar
   allowlists de CORS/Swagger, backups, retención, alertas y recuperación.

Los detalles de controles y límites están en [`docs/SEGURIDAD.md`](./docs/SEGURIDAD.md);
la cobertura por historia en [`docs/TRAZABILIDAD.md`](./docs/TRAZABILIDAD.md) y
el plan de persistencia en [`docs/MIGRACION_BD.md`](./docs/MIGRACION_BD.md).
