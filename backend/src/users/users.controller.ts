import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { AuthService } from '../auth/auth.service.js';
import { InviteUserDto } from './dto/invite-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { SetUserStatusDto } from './dto/set-user-status.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { AdminGuard } from '../auth/guards/admin.guard.js';

function toSummary(user: Awaited<ReturnType<UsersService['findById']>>) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    accountType: user.accountType,
    status: user.status,
    createdAt: user.createdAt,
  };
}

@Controller('users')
@UseGuards(JwtAccessGuard, AdminGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async findAll() {
    const users = await this.usersService.listAll();
    return users.map(toSummary);
  }

  @Post('invite')
  async invite(@Body() dto: InviteUserDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new ForbiddenException('A user with that email already exists');
    const user = await this.usersService.invite(dto);
    const setPasswordLink = await this.authService.generateResetLink(user);
    return { user: toSummary(user), setPasswordLink };
  }

  @Post(':id/resend-invite')
  async resendInvite(@Param('id') id: string) {
    const user = await this.usersService.findById(id);
    if (!user) throw new ForbiddenException('User not found');
    const setPasswordLink = await this.authService.generateResetLink(user);
    return { setPasswordLink };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    const user = await this.usersService.updateProfile(id, dto);
    return toSummary(user);
  }

  @Patch(':id/status')
  async setStatus(@Param('id') id: string, @Body() dto: SetUserStatusDto) {
    const user = await this.usersService.setStatus(id, dto.status);
    return toSummary(user);
  }
}
