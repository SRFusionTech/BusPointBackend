import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { ContentService } from './content.service';
import { CreateContentDto } from './dto/create-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';
import { EntityType, ContentType } from './entities/content.entity';

@Controller('content')
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  // POST /api/content
  @Post()
  create(@Body() createContentDto: CreateContentDto) {
    return this.contentService.create(createContentDto);
  }

  // GET /api/content/:id
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.contentService.findOne(id);
  }

  // GET /api/content/entity/:entityType/:entityId
  // Optional ?contentType=PROFILE_PICTURE filter
  @Get('entity/:entityType/:entityId')
  findByEntity(
    @Param('entityType') entityType: EntityType,
    @Param('entityId') entityId: string,
    @Query('contentType') contentType?: ContentType,
  ) {
    if (contentType) {
      return this.contentService.findByEntityAndType(entityType, entityId, contentType);
    }
    return this.contentService.findByEntity(entityType, entityId);
  }

  // GET /api/content/entity/:entityType/:entityId/profile-picture
  @Get('entity/:entityType/:entityId/profile-picture')
  findProfilePicture(
    @Param('entityType') entityType: EntityType,
    @Param('entityId') entityId: string,
  ) {
    return this.contentService.findProfilePicture(entityType, entityId);
  }

  // PATCH /api/content/:id
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateContentDto: UpdateContentDto,
  ) {
    return this.contentService.update(id, updateContentDto);
  }

  // PATCH /api/content/:id/deactivate
  @Patch(':id/deactivate')
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.contentService.deactivate(id);
  }

  // DELETE /api/content/:id
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.contentService.remove(id);
  }

  // DELETE /api/content/entity/:entityType/:entityId
  @Delete('entity/:entityType/:entityId')
  removeAllForEntity(
    @Param('entityType') entityType: EntityType,
    @Param('entityId') entityId: string,
  ) {
    return this.contentService.removeAllForEntity(entityType, entityId);
  }
}
