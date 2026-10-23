export const CATEGORIAS_REPOSITORY = 'CATEGORIAS_REPOSITORY';

export const INITIAL_CATEGORIES = [
  { nombre: 'Accesos y contraseñas', areaNombre: 'Seguridad y accesos' },
  { nombre: 'Equipos y periféricos', areaNombre: 'Soporte en sitio' },
  { nombre: 'Software y aplicaciones', areaNombre: 'Soporte de aplicaciones' },
  { nombre: 'Red y conectividad', areaNombre: 'Infraestructura y redes' },
  {
    nombre: 'Correo y herramientas de colaboración',
    areaNombre: 'Infraestructura y redes',
  },
  { nombre: 'Compra o entrega de equipos', areaNombre: 'Aprovisionamiento' },
] as const;
