import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from './auth.guard.js';
import type { AuthenticatedPrincipal } from './auth.types.js';
import { CurrentUser } from './current-user.decorator.js';

@Controller('auth')
export class AuthController {
  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: AuthenticatedPrincipal): AuthenticatedPrincipal {
    return user;
  }
}
