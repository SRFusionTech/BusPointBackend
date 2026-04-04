import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateBusDto } from './create-bus.dto';

export class UpdateBusDto extends PartialType(
  OmitType(CreateBusDto, ['schoolId'] as const),
) {}
