# Plan de migración a PostgreSQL

## Objetivos

Sustituir todos los repositorios InMemory sin cambiar los contratos HTTP. Mantener
las políticas de visibilidad, versiones optimistas, orden de bitácora y atomicidad
de conversión de correo. La base de datos será la fuente de verdad; anexos grandes
permanecerán en almacenamiento privado de objetos/volumen y no dentro de filas.

## Modelo y restricciones propuestas

- `usuarios`: UUID PK; correo normalizado con índice único; hash BCrypt; estado
  activo; rol; FK de área opcional.
- `areas`, `categorias`: UUID PK, nombre normalizado único; `activa`; categoría
  con FK a su área sugerida. No borrar registros referenciados.
- `tickets`: UUID PK, número único, versión `BIGINT`, estado/tipo/prioridad,
  solicitante, fechas y FK a usuario/área/categoría. Índices compuestos por
  estado/área/fecha y por número.
- `sesiones`: UUID de sesión, FK de usuario, última actividad y expiración;
  eliminar/revocar en una transacción al desactivar usuario o cambiar credenciales.
- `bitacora`: append-only con FK de ticket/actor, tipo, JSONB validado y fecha;
  el rol de aplicación solo inserta/consulta, sin UPDATE/DELETE.
- `escalamientos`, `anotaciones`, `anexos`: FK, metadatos mínimos, índices de
  ticket/fecha; la clave de objeto no es una ruta suministrada por usuario.
- `comunicaciones`: `message_id` único para deduplicación atómica, remitente,
  asunto filtrado, solo texto plano limitado, fecha y estado de conversión.
- `notificacion_outbox`: evento, ticket, tipo, estado, intentos, `next_attempt_at`
  e idempotency key única; payload mínimo/retención limitada.

## Transacciones e idempotencia

1. Crear ticket: generar número con secuencia independiente INC/REQ, insertar
   ticket y bitácora en una transacción; publicar notificación en outbox al hacer
   commit.
2. Acción de ticket: `UPDATE ... WHERE id=? AND version=?`, incrementar versión
   y guardar evento/escala en la misma transacción. Cero filas actualizadas es
   conflicto 409. Una clave idempotente puede evitar duplicados de reintentos.
3. Convertir correo: bloquear/fijar fila por `message_id`, crear ticket y bitácora,
   actualizar comunicación a convertida y escribir outbox en una sola transacción.
   Si falla cualquier paso, la comunicación queda pendiente.
4. Anexos: validar antes de subir; guardar objeto con clave aleatoria privada y
   luego insertar metadatos en transacción. Si la transacción falla, borrar el
   objeto como compensación; preferir staging y proceso de reconciliación.
5. Notificaciones: un worker reclama filas con `FOR UPDATE SKIP LOCKED`, envía
   fuera de la transacción, guarda resultado/reintento y nunca repite una clave
   ya aceptada por el proveedor si se puede evitar.

## Secuencia de despliegue

1. Definir migraciones reversibles y pruebas contra PostgreSQL real; documentar
   constraints, índices, retención y compatibilidad de datos.
2. Ejecutar migraciones en staging, probar restauración de backup y carreras.
3. Exportar datos InMemory solo para desarrollo/demo; no hay persistencia actual
   desde la que recuperar datos productivos.
4. Desplegar con migraciones hacia adelante, health checks, backup y métrica de
   errores; comparar consultas/paginación y SLA antes de retirar adaptadores
   InMemory.
5. Migrar los intentos del portal a Redis/DB con operación atómica y TTL antes
   de escalar a varias réplicas.

## Decisiones aún necesarias

Elegir proveedor PostgreSQL, estrategia de migraciones (por ejemplo, TypeORM o
Prisma), almacenamiento de objetos, retención legal de bitácora/correos,
política de borrado/anonimización y SLA de recuperación. No se eligió ORM ni se
añadió dependencia porque este documento es un plan y la fase no autoriza todavía
implementar persistencia.
