import { UserRole } from '../enums/user-role.enum.js';

export const ROLES_KEY = 'roles';
export const IS_PUBLIC_KEY = 'isPublic';
export const SUPPORT_ROLES = [
  UserRole.AGENTE,
  UserRole.SUPERVISOR,
  UserRole.ADMINISTRADOR,
] as const;
