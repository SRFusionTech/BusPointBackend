import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Query,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { BusesService } from './buses.service';
import { BusIconsService } from '../bus-icons/bus-icons.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { CreateBusDto } from './dto/create-bus.dto';
import { UpdateBusDto } from './dto/update-bus.dto';
import { BusStatus } from './entities/bus.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { QueryAlias } from '../common/decorators/query-alias.decorator';

@Controller('buses')
export class BusesController {
  constructor(
    private readonly busesService: BusesService,
    private readonly busIconsService: BusIconsService,
    private readonly trackingGateway: TrackingGateway,
  ) {}

  // POST /api/buses
  @Post()
  create(@Req() req: { user: User }, @Body() createBusDto: CreateBusDto) {
    if (req.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only school admins can create buses');
    }
    if (!req.user.schoolId || req.user.schoolId !== createBusDto.schoolId) {
      throw new ForbiddenException('Cannot create bus for another school');
    }
    return this.busesService.create(createBusDto);
  }

  // GET /api/buses?school_id=xxx
  @Get()
  async findAll(@Req() req: { user: User }, @QueryAlias('schoolId', 'school_id') schoolId?: string) {
    const user = req.user;
    if (user.role === UserRole.ADMIN) {
      if (!user.schoolId) return [];
      if (schoolId && schoolId !== user.schoolId) {
        throw new ForbiddenException('Cannot access another school');
      }
      return this.busesService.findAll(user.schoolId);
    }

    if ((user.role === UserRole.PARENT || user.role === UserRole.DRIVER) && user.busId) {
      const bus = await this.busesService.findOne(user.busId);
      return [bus];
    }

    throw new ForbiddenException('Not allowed to list buses');
  }

  // GET /api/buses/school/:schoolId
  @Get('school/:schoolId')
  findBySchool(@Req() req: { user: User }, @Param('schoolId', ParseUUIDPipe) schoolId: string) {
    if (req.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only school admins can view school buses');
    }
    if (!req.user.schoolId || req.user.schoolId !== schoolId) {
      throw new ForbiddenException('Cannot access another school');
    }
    return this.busesService.findBySchool(schoolId);
  }

  // GET /api/buses/:id/with-driver
  @Get(':id/with-driver')
  async getWithDriver(@Req() req: { user: User }, @Param('id', ParseUUIDPipe) id: string) {
    const user = req.user;
    const bus = await this.busesService.findOne(id);
    if (user.role === UserRole.ADMIN) {
      if (!user.schoolId || user.schoolId !== bus.schoolId) {
        throw new ForbiddenException('Cannot access another school bus');
      }
    } else if (user.role === UserRole.PARENT || user.role === UserRole.DRIVER) {
      if (!user.busId || user.busId !== id) {
        throw new ForbiddenException('Cannot access unassigned bus');
      }
    } else {
      throw new ForbiddenException('Role not allowed');
    }
    return this.busesService.getWithDriver(id);
  }

  // GET /api/buses/:id
  @Get(':id')
  async findOne(@Req() req: { user: User }, @Param('id', ParseUUIDPipe) id: string) {
    const user = req.user;
    const bus = await this.busesService.findOne(id);
    if (user.role === UserRole.ADMIN) {
      if (!user.schoolId || user.schoolId !== bus.schoolId) {
        throw new ForbiddenException('Cannot access another school bus');
      }
      return bus;
    }
    if ((user.role === UserRole.PARENT || user.role === UserRole.DRIVER) && user.busId === id) {
      return bus;
    }
    throw new ForbiddenException('Cannot access unassigned bus');
  }

  // PUT /api/buses/:id
  @Put(':id')
  async update(
    @Req() req: { user: User },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateBusDto: UpdateBusDto,
  ) {
    if (req.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only school admins can update buses');
    }
    const bus = await this.busesService.findOne(id);
    if (!req.user.schoolId || req.user.schoolId !== bus.schoolId) {
      throw new ForbiddenException('Cannot update another school bus');
    }
    return this.busesService.update(id, updateBusDto);
  }

  // PUT /api/buses/:id/location
  @Put(':id/location')
  async updateLocation(
    @Req() req: { user: User },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { lat: number; lng: number },
  ) {
    const bus = await this.busesService.findOne(id);
    if (req.user.role === UserRole.ADMIN) {
      if (!req.user.schoolId || req.user.schoolId !== bus.schoolId) {
        throw new ForbiddenException('Cannot update another school bus');
      }
    } else if (req.user.role === UserRole.DRIVER) {
      if (!req.user.busId || req.user.busId !== id) {
        throw new ForbiddenException('Cannot update unassigned bus');
      }
    } else {
      throw new ForbiddenException('Role not allowed');
    }
    return this.busesService.updateLocation(id, body.lat, body.lng);
  }

  // PUT /api/buses/:id/status?status=started
  @Put(':id/status')
  async updateStatus(
    @Req() req: { user: User },
    @Param('id', ParseUUIDPipe) id: string,
    @Query('status') status: BusStatus,
  ) {
    const bus = await this.busesService.findOne(id);
    if (req.user.role === UserRole.ADMIN) {
      if (!req.user.schoolId || req.user.schoolId !== bus.schoolId) {
        throw new ForbiddenException('Cannot update another school bus');
      }
    } else if (req.user.role === UserRole.DRIVER) {
      if (!req.user.busId || req.user.busId !== id) {
        throw new ForbiddenException('Cannot update unassigned bus');
      }
    } else {
      throw new ForbiddenException('Role not allowed');
    }
    return this.busesService.updateStatus(id, status);
  }

  // PATCH /api/buses/:id/icon  — assign a bus icon from the library
  @Patch(':id/icon')
  async assignIcon(
    @Req() req: { user: User },
    @Param('id', ParseUUIDPipe) id: string,
    @Body('iconId', ParseUUIDPipe) iconId: string,
  ) {
    if (req.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only school admins can assign icons');
    }
    const targetBus = await this.busesService.findOne(id);
    if (!req.user.schoolId || req.user.schoolId !== targetBus.schoolId) {
      throw new ForbiddenException('Cannot update another school bus');
    }
    const icon = await this.busIconsService.findOne(iconId);
    const bus = await this.busesService.assignIcon(id, icon.id, icon.url);
    // Notify any connected clients watching this bus in real-time
    this.trackingGateway.broadcastIconChange(id, icon.url);
    return bus;
  }

  // DELETE /api/buses/:id
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() req: { user: User }, @Param('id', ParseUUIDPipe) id: string) {
    if (req.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only school admins can delete buses');
    }
    const bus = await this.busesService.findOne(id);
    if (!req.user.schoolId || req.user.schoolId !== bus.schoolId) {
      throw new ForbiddenException('Cannot delete another school bus');
    }
    return this.busesService.remove(id);
  }
}
