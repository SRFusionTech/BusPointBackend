import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { DemoRequestsService } from './demo-requests.service';
import { CreateDemoRequestDto } from './dto/create-demo-request.dto';
import { UpdateDemoRequestDto } from './dto/update-demo-request.dto';
import { ListDemoRequestsDto } from './dto/list-demo-requests.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

function clientIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  const first = Array.isArray(fwd) ? fwd[0] : fwd?.split(',')[0];
  return (first ?? req.socket?.remoteAddress ?? null)?.trim() || null;
}

/**
 * "Request a demo" pipeline.
 *   POST   /api/demo-requests            public (marketing site)
 *   GET    /api/demo-requests            super admin — list / filter / search
 *   GET    /api/demo-requests/stats      super admin — counts per status
 *   GET    /api/demo-requests/:id        super admin
 *   PATCH  /api/demo-requests/:id        super admin — status, notes, owner
 */
@Controller('demo-requests')
export class DemoRequestsController {
  constructor(private readonly service: DemoRequestsService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateDemoRequestDto, @Req() req: Request) {
    return this.service.create(dto, { ip: clientIp(req), userAgent: (req.headers['user-agent'] as string | undefined) ?? null });
  }

  @Roles(Role.SUPER_ADMIN)
  @Get()
  list(@Query() q: ListDemoRequestsDto) {
    return this.service.list(q);
  }

  @Roles(Role.SUPER_ADMIN)
  @Get('stats')
  stats() {
    return this.service.stats();
  }

  @Roles(Role.SUPER_ADMIN)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Roles(Role.SUPER_ADMIN)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDemoRequestDto) {
    return this.service.update(id, dto);
  }
}
