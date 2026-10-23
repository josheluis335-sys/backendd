import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../enums/user-role.enum.js';
import { ROLES_KEY, SUPPORT_ROLES } from '../constants/roles.constant.js';

export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
export const AnyRole = () => Roles(...SUPPORT_ROLES);
