import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import type { User, UserAccountType, UserStatus, Role } from '../generated/prisma/client.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  create(data: { email: string; passwordHash: string; fullName: string }): Promise<User> {
    return this.prisma.user.create({ data });
  }

  findByResetTokenHash(resetTokenHash: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { resetTokenHash, resetTokenExpiresAt: { gt: new Date() } },
    });
  }

  setResetToken(id: string, resetTokenHash: string, resetTokenExpiresAt: Date): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { resetTokenHash, resetTokenExpiresAt } });
  }

  resetPassword(id: string, passwordHash: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { passwordHash, resetTokenHash: null, resetTokenExpiresAt: null },
    });
  }

  listAll(): Promise<User[]> {
    return this.prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
  }

  /** Creates a brand-new account with an unusable random password hash -
   * the account can only ever be accessed via the set-password link this
   * generates (see AuthService.generateResetLink), never by guessing an
   * empty/blank password. */
  async invite(data: { email: string; fullName: string; accountType: UserAccountType; role?: Role }): Promise<User> {
    const unusablePassword = randomBytes(32).toString('hex');
    const passwordHash = await bcrypt.hash(unusablePassword, 10);
    return this.prisma.user.create({
      data: {
        email: data.email,
        fullName: data.fullName,
        accountType: data.accountType,
        role: data.role ?? 'MEMBER',
        passwordHash,
      },
    });
  }

  updateProfile(id: string, data: { fullName?: string; role?: Role; accountType?: UserAccountType }): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }

  setStatus(id: string, status: UserStatus): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { status } });
  }
}
