import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { AssistantService } from './assistant.service.js';
import { AskDto } from './dto/assistant.dto.js';

// The service checks who may ask (the Setjeka team) and that a named
// project is theirs to see.
@Controller('assistant')
@UseGuards(JwtAccessGuard)
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Get('status')
  status(@CurrentUser() user: JwtPayload) {
    return this.assistant.status(user.sub);
  }

  @Post('ask')
  @HttpCode(200)
  ask(@Body() dto: AskDto, @CurrentUser() user: JwtPayload) {
    return this.assistant.ask(user.sub, dto);
  }
}
