import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import { SupabaseAuthService } from './supabase-auth.service.js';

@Module({
  controllers: [AuthController],
  providers: [SupabaseAuthService, AuthGuard, RolesGuard],
  exports: [SupabaseAuthService, AuthGuard, RolesGuard],
})
export class AuthModule {}
