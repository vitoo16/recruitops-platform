import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { RateLimitService } from './rate-limit.service.js';
import { RolesGuard } from './roles.guard.js';
import { SupabaseAuthService } from './supabase-auth.service.js';

@Module({
  imports: [RedisModule],
  controllers: [AuthController],
  providers: [SupabaseAuthService, AuthGuard, RateLimitService, RolesGuard],
  exports: [SupabaseAuthService, AuthGuard, RolesGuard],
})
export class AuthModule {}
