import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Content, EntityType, ContentType } from './entities/content.entity';
import { CreateContentDto } from './dto/create-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';

@Injectable()
export class ContentService {
  constructor(
    @InjectRepository(Content)
    private readonly contentRepository: Repository<Content>,
  ) {}

  create(createContentDto: CreateContentDto): Promise<Content> {
    const content = this.contentRepository.create(createContentDto);
    return this.contentRepository.save(content);
  }

  // Get all content for a given entity (e.g. all photos of a school)
  findByEntity(entityType: EntityType, entityId: string): Promise<Content[]> {
    return this.contentRepository.findBy({ entityType, entityId, isActive: true });
  }

  // Get content filtered by type (e.g. only PROFILE_PICTURE for a user)
  findByEntityAndType(
    entityType: EntityType,
    entityId: string,
    contentType: ContentType,
  ): Promise<Content[]> {
    return this.contentRepository.findBy({
      entityType,
      entityId,
      contentType,
      isActive: true,
    });
  }

  // Convenience: get the single active profile picture for any entity
  async findProfilePicture(
    entityType: EntityType,
    entityId: string,
  ): Promise<Content | null> {
    return this.contentRepository.findOneBy({
      entityType,
      entityId,
      contentType: ContentType.PROFILE_PICTURE,
      isActive: true,
    });
  }

  async findOne(id: string): Promise<Content> {
    const content = await this.contentRepository.findOneBy({ id });
    if (!content) {
      throw new NotFoundException(`Content with id ${id} not found`);
    }
    return content;
  }

  async update(id: string, updateContentDto: UpdateContentDto): Promise<Content> {
    const content = await this.findOne(id);
    Object.assign(content, updateContentDto);
    return this.contentRepository.save(content);
  }

  // Soft delete — marks isActive false, keeps the record
  async deactivate(id: string): Promise<Content> {
    const content = await this.findOne(id);
    content.isActive = false;
    return this.contentRepository.save(content);
  }

  // Hard delete
  async remove(id: string): Promise<void> {
    const content = await this.findOne(id);
    await this.contentRepository.remove(content);
  }

  // Hard delete all content for an entity (e.g. when entity is deleted)
  async removeAllForEntity(entityType: EntityType, entityId: string): Promise<{ deleted: number }> {
    const items = await this.contentRepository.findBy({ entityType, entityId });
    await this.contentRepository.remove(items);
    return { deleted: items.length };
  }
}
