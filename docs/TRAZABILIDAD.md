# Trazabilidad de historias y pruebas

No hay en el repositorio un catálogo fuente que defina los títulos completos de
HU-01..HU-15. La relación siguiente es una matriz provisional inferida del
alcance de fases solicitado; no reemplaza la especificación funcional aprobada.
Los nombres de test son los `it(...)` que protegen el comportamiento.

| HU | Alcance provisional | Evidencia principal |
|---|---|---|
| HU-01 | Login, sesiones, cuentas y autorización | `test/auth.e2e-spec.ts`: login público, 401, 403, sesión inactiva, desactivación y cobertura completa de rutas; `test/usuarios.e2e-spec.ts`: administración y directorio. |
| HU-02 | Áreas de soporte | `test/areas.e2e-spec.ts`: seed, filtro, unicidad, edición/desactivación y roles. |
| HU-03 | Categorías y área sugerida | `test/categorias.e2e-spec.ts`: seed, unicidad, área sugerida activa y roles. |
| HU-04 | Notificación por correo en creación/escalamiento/cierre | `test/tickets.e2e-spec.ts`: `sends one safe notification...`, fallo no revierte, conflicto y cierre simultáneo; `src/notificaciones/notificaciones.service.spec.ts`: plantillas, destinatario, límite y timeout. |
| HU-05 | Creación y consulta de tickets | `test/tickets.e2e-spec.ts`: secuencias INC/REQ, bitácora y visibilidad. |
| HU-06 | Escalamiento | `test/tickets.e2e-spec.ts`: escalamiento, reasignación, historial y carrera de cierres. |
| HU-07 | Pausa, reanudación y cierre | `test/tickets.e2e-spec.ts`: transiciones, calendario hábil y cierre concurrente. |
| HU-08 | Bitácora de ticket | `test/tickets.e2e-spec.ts`: orden/eventos y actor; controller `src/bitacora/bitacora.controller.ts`. |
| HU-09 | SLA y listado de supervisor | `test/tickets.e2e-spec.ts`: visibilidad antes de filtros/paginación, filtros SLA y antigüedad superior a 3660 días. |
| HU-10 | Anotaciones y anexos | `test/anotaciones-anexos.e2e-spec.ts`: roles, IDOR, formatos, descarga, batch atómico, throttling y metadatos. |
| HU-11 | Consulta pública de estado | `test/publico.e2e-spec.ts`: lista blanca, estados, respuesta indistinguible, bloqueos, concurrencia, proxy, CORS y cambios de soporte. |
| HU-12 | Recepción de correos entrantes | `test/comunicaciones.e2e-spec.ts`, `src/comunicaciones/comunicaciones.service.spec.ts` y `src/comunicaciones/mailbox/mailparser-plaintext.spec.ts`: parseo, deduplicación y descarte. |
| HU-13 | Conversión de comunicación a ticket | `test/comunicaciones.e2e-spec.ts`: conversión única, conflicto y categoría inactiva; `src/comunicaciones/comunicaciones.job.spec.ts`: marcado leído solo después de guardar. |
| HU-14 | Operación HTTP y salud | `test/security-hardening.e2e-spec.ts`: respuesta mínima, throttle y CORS aislado. |
| HU-15 | Resumen sugerido por categoría y no retroactividad | `test/categorias.e2e-spec.ts`: `does not change existing tickets when a category area suggestion changes` confirma que un ticket existente mantiene su `areaActualId`. |

## Huecos al cierre

- La prueba e2e de ciclo integral que cree roles/área, ingrese correo, convierta,
  ejecute acciones, consulte portal, bitácora y tres avisos debe ser agregada.
- Los títulos/criterios originales de las HU no estaban presentes, por lo que la
  numeración salvo HU-04 y HU-11 se asume y debe validarse con producto.
