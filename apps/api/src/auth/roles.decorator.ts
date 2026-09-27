import { SetMetadata } from '@nestjs/common';
import type { AppRole } from './auth.types.js';

export const ROLES_KEY = 'recruitops:roles';
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);
