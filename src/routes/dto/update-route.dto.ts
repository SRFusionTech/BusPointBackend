import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateRouteDto } from './create-route.dto';

export class UpdateRouteDto extends PartialType(
  OmitType(CreateRouteDto, ['schoolId'] as const),
) {}
