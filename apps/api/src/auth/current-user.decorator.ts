import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedPrincipal } from './auth.types.js';
import type { AuthenticatedRequest } from './auth.guard.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPrincipal | undefined =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
