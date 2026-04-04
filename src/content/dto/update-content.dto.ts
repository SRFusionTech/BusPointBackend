import { IsString, IsOptional, IsObject, IsBoolean } from 'class-validator';

export class UpdateContentDto {
  @IsString()
  @IsOptional()
  url?: string;

  @IsString()
  @IsOptional()
  fileName?: string;

  @IsString()
  @IsOptional()
  mimeType?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
