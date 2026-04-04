import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { BusIconsService } from './bus-icons.service';
import { CreateBusIconDto } from './dto/create-bus-icon.dto';
import { Public } from '../auth/decorators/public.decorator';

@Controller('bus-icons')
export class BusIconsController {
  constructor(private readonly busIconsService: BusIconsService) {}

  // POST /api/bus-icons  (admin only in production — no role guard yet)
  @Post()
  create(@Body() dto: CreateBusIconDto) {
    return this.busIconsService.create(dto);
  }

  // GET /api/bus-icons  — public so the mobile app can fetch the library
  @Public()
  @Get()
  findAll() {
    return this.busIconsService.findAll();
  }

  // GET /api/bus-icons/:id
  @Public()
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.busIconsService.findOne(id);
  }

  // DELETE /api/bus-icons/:id
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.busIconsService.remove(id);
  }
}
