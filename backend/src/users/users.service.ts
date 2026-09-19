import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { User } from '../generated/prisma/client.js';

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
}
