import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsInt, IsNotEmpty, IsOptional, IsString,
  MaxLength, ValidateNested,
} from 'class-validator';

export class SectionInputDto {
  /** Existing section id — keep it to rename in place; omit for a new section. */
  @IsOptional()
  @IsInt()
  id?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  name!: string;
}

export class CreateClassDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  name!: string;

  /** Sections in display order — at least one (a parent must pick a section). */
  @IsArray()
  @ArrayMinSize(1, { message: 'Add at least one section.' })
  @ArrayMaxSize(26)
  @ValidateNested({ each: true })
  @Type(() => SectionInputDto)
  sections!: SectionInputDto[];
}

export class UpdateClassDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  name?: string;

  /**
   * Full replacement list, in display order. Entries with an id are kept/renamed,
   * entries without are added, and existing sections left out are deleted.
   */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Add at least one section.' })
  @ArrayMaxSize(26)
  @ValidateNested({ each: true })
  @Type(() => SectionInputDto)
  sections?: SectionInputDto[];
}

export class ReorderClassesDto {
  /** Every class id of the school, in the new display order. */
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  ids!: number[];
}
