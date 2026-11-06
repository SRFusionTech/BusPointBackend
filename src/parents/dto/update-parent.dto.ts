import { IsString, IsOptional, IsNotEmpty, MinLength, MaxLength, Matches, IsBoolean, IsUUID, IsDateString, ValidateIf, IsInt } from 'class-validator';

export class UpdateParentDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  fullName?: string;

  @IsString()
  @IsOptional()
  @Matches(/^[6-9]\d{9}$/, { message: 'phone must be a valid 10-digit mobile number' })
  phone?: string;

  @IsString()
  @IsOptional()
  @IsNotEmpty({ message: "Child's name can't be empty." })
  @MaxLength(100)
  childName?: string;

  /** Change the child's class. Mandatory, so it can't be cleared — send childSectionId with it. */
  @IsOptional()
  @IsInt({ message: 'Select the child\'s class.' })
  childClassId?: number;

  /** Change the child's section (must belong to the class). Can't be cleared. */
  @IsOptional()
  @IsInt({ message: 'Select the child\'s section.' })
  childSectionId?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  /** Reassign the parent's pickup point. Can't be cleared — only swapped for another stop. */
  @IsUUID(undefined, { message: 'routeStopId must be a valid stop id' })
  @IsOptional()
  routeStopId?: string;

  /** The parent's own subscription expiry (ISO date), or null to clear it. */
  @IsOptional()
  @ValidateIf((o) => o.subscriptionExpiresAt !== null)
  @IsDateString()
  subscriptionExpiresAt?: string | null;
}
