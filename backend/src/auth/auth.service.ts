import { randomBytes, createHash } from 'node:crypto';
import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service.js';
import type { JwtPayload } from './jwt-payload.js';
import type { User } from '../generated/prisma/client.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
// One message for a wrong password, an unknown email and a locked account,
// so the reply never confirms that an address has an account (critique
// V3-H-03). It says what happens after six tries.
const REFUSED = 'Invalid email or password. Six wrong tries lock an account until a Setjeka administrator unlocks it.';
/** An administrator's own lock lifts by itself after this long, so the only
 * administrator can't be shut out by someone guessing their address. */
const ADMIN_LOCK_MS = 30 * 60 * 1000;
const stillLocked = (u: { lockedAt: Date | null; role: string }) =>
  Boolean(u.lockedAt) && !(u.role === 'ADMIN' && Date.now() - u.lockedAt!.getTime() > ADMIN_LOCK_MS);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) return null;
    if (user.status !== 'ACTIVE') return null;
    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) return null;
    return user;
  }

  async login(
    email: string,
    password: string,
    rememberMe = false,
  ): Promise<
    TokenPair & {
      user: {
        id: string;
        email: string;
        fullName: string;
        role: string;
        accountType: string;
        clientId: string | null;
        contractorId: string | null;
        dateFormat: string;
      };
    }
  > {
    // Six wrong passwords in a row lock the account until an administrator
    // unlocks it (critique M-03). Resetting the password doesn't unlock it.
    const found = await this.usersService.findByEmail(email);
    if (found && stillLocked(found)) throw new UnauthorizedException(REFUSED);
    // An administrator whose 30 minutes are up starts again from zero.
    if (found?.lockedAt) await this.usersService.unlock(found.id);
    const user = await this.validateUser(email, password);
    if (!user) {
      if (found) await this.usersService.recordFailedLogin(found.id);
      throw new UnauthorizedException(REFUSED);
    }
    if (user.failedLogins) await this.usersService.clearFailedLogins(user.id);

    const tokens = await this.issueTokens(
      { sub: user.id, email: user.email, role: user.role, accountType: user.accountType },
      rememberMe,
    );
    // clientId/contractorId only drive which portal menu the frontend shows;
    // every portal endpoint re-reads them from the database itself.
    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        accountType: user.accountType,
        clientId: user.clientId,
        contractorId: user.contractorId,
        dateFormat: user.dateFormat,
      },
    };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: JwtPayload & { rememberMe?: boolean };
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload & { rememberMe?: boolean }>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('User no longer exists');
    if (stillLocked(user)) throw new UnauthorizedException(REFUSED);

    return this.issueTokens(
      { sub: user.id, email: user.email, role: user.role, accountType: user.accountType },
      Boolean(payload.rememberMe),
    );
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      // Deliberately silent: the caller always gets a generic success
      // response so this endpoint can't be used to enumerate accounts.
      return;
    }

    const resetLink = await this.generateResetLink(user);
    // Email delivery (Resend) is not wired up yet - logging the link here is
    // the deliberate stand-in so the reset flow can be tested end to end
    // until that's in place.
    this.logger.log(`Password reset requested for ${user.email}: ${resetLink}`);
  }

  /** Generates a fresh set-password/reset link for `user` and stores its
   * hash, reusing the same token mechanism for both "forgot password" and
   * the Administration invite flow (no email provider is connected yet -
   * both flows return/log the link for manual sharing). */
  async generateResetLink(user: User): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashResetToken(token);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await this.usersService.setResetToken(user.id, tokenHash, expiresAt);

    const frontendOrigin = this.configService.get<string>('FRONTEND_ORIGIN') ?? 'http://localhost:3000';
    return `${frontendOrigin}/reset-password?token=${token}`;
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = this.hashResetToken(token);
    const user = await this.usersService.findByResetTokenHash(tokenHash);
    if (!user) throw new BadRequestException('Invalid or expired reset token');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.usersService.resetPassword(user.id, passwordHash);
  }

  private hashResetToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async issueTokens(payload: JwtPayload, rememberMe: boolean): Promise<TokenPair> {
    const refreshTtl = rememberMe
      ? this.configService.get<string>('JWT_REFRESH_TTL_REMEMBER')
      : this.configService.get<string>('JWT_REFRESH_TTL');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.configService.get<string>('JWT_ACCESS_TTL') as JwtSignOptions['expiresIn'],
      }),
      this.jwtService.signAsync(
        { ...payload, rememberMe },
        {
          secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
          expiresIn: refreshTtl as JwtSignOptions['expiresIn'],
        },
      ),
    ]);
    return { accessToken, refreshToken };
  }
}
