# Revisión de seguridad

## Alcance y resultado

Revisión estática y pruebas de regresión del código de la Mesa de Servicio.
El repositorio no contiene una especificación formal de HU-01..HU-15, un modelo
de despliegue ni un ambiente productivo; las correspondencias de HU se declaran
provisionales en `TRAZABILIDAD.md`. `npm audit` se ejecuta contra el lockfile.
No se ejecutó un escáner de secretos especializado ni una prueba de penetración.

No se identificó en esta revisión una ruta de explotación remota demostrada.
Esto no equivale a certificación de seguridad: la persistencia actual es en
memoria y los riesgos operativos listados abajo deben resolverse antes de
producción.

| Severidad | Hallazgo / riesgo | Estado y evidencia |
|---|---|---|
| Alta (preproducción) | Repositorios InMemory pierden tickets, usuarios, eventos y deduplicación al reiniciar; no soportan consistencia entre instancias. | Riesgo arquitectónico conocido; requiere migración PostgreSQL y restricciones/transacciones. |
| Alta (preproducción) | Los adjuntos no pasan por antivirus ni cifrado en reposo. | Validación de formato/tamaño, nombre, MIME y almacenamiento fuera de web root implementados; antivirus/cifrado quedan pendientes. |
| Media | El bloqueo del portal se conserva en memoria y no coordina instancias. | Cotas, reloj inyectable y bloqueo atómico cubiertos en `test/publico.e2e-spec.ts`; Redis/base de datos pendiente al escalar horizontalmente. |
| Media | El envío de notificaciones no tiene outbox persistente ni reintentos durables. | El fallo no revierte la acción y se registra; cola durable pendiente junto a PostgreSQL. |
| Media | Posible abuso automatizado del portal público. | Ventanas/bloqueos y throttling implementados; CAPTCHA queda como contingencia ante abuso. |
| Informativa | El `trust proxy` mal configurado permitiría suplantar la IP usada para límites. | Por defecto `false`; activar solo con proxy controlado. |
| Informativa | Swagger podría revelar el inventario de API si se publica sin control. | Desactivado por defecto en producción; requiere allowlist `SWAGGER_ALLOWED_IPS`. |

## Controles comprobados

- JWT HS256, sesiones activas/expiración y guards globales fail-closed; cobertura
  por ruta y roles en `test/auth.e2e-spec.ts`.
- DTOs con whitelist y rechazo de campos no permitidos; errores públicos del
  portal normalizados; secretos JWT/SMTP/IMAP redactados del filtro global.
- Consultas públicas por POST, respuesta de lista blanca y comparación constante
  de hash; bloqueos IP+caso, IP y global; CORS aislado y límite de cuerpo.
- Anexos en directorio privado, UUID opaco, MIME detectado del lado servidor,
  validación por firma/contenido, límite fijo 10 MiB, encabezados seguros y
  escrituras atómicas.
- Bitácora append-only; visibilidad del ticket evaluada antes de filtros y
  paginación; actividades críticas dentro de unidad de trabajo.
- Correo entrante usa solo texto plano normalizado; descarta automáticos y
  adjuntos, limita tamaño/volumen, deduplica y no registra datos de mensaje.
- Helmet, `X-Powered-By` deshabilitado, CORS con listas independientes y
  `GET /api/salud` con respuesta mínima.

## Verificaciones reproducibles

Ejecutar `npm audit`, `npm run lint`, `npm test` y `npm run test:e2e`.
La búsqueda manual debe excluir `node_modules`, `dist`, `coverage` y archivos de
datos. La ausencia de Docker o de un escáner de secretos especializado debe
informarse como limitación y no como resultado limpio de esas herramientas.
