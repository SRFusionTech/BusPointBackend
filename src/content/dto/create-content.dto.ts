import {
  IsEnum,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
  IsNumber,
  IsPositive,
} from 'class-validator';
import { EntityType, ContentType } from '../entities/content.entity';

export class CreateContentDto {
  @IsEnum(EntityType)
  entityType: EntityType;

  @IsString()
  @IsNotEmpty()
  entityId: string;

  @IsEnum(ContentType)
  contentType: ContentType;

  @IsString()
  @IsNotEmpty()
  url: string;

  @IsString()
  @IsOptional()
  fileName?: string;

  @IsString()
  @IsOptional()
  mimeType?: string;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  fileSize?: number;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
