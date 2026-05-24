import { IsArray, IsUUID, ArrayNotEmpty } from 'class-validator';

export class ReorderStopsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  stopIds: string[];
}
