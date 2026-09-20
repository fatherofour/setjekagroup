import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAccessGuard } from './guards/jwt-access.guard.js';
import { AdminGuard } from './guards/admin.guard.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  imports: [forwardRef(() => UsersModule), JwtModule.register({ global: true })],
  controllers: [AuthController],
  providers: [AuthService, JwtAccessGuard, AdminGuard],
  exports: [AuthService, JwtAccessGuard, AdminGuard],
})
export class AuthModule {}
