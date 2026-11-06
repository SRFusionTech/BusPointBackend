import { IsString, IsNotEmpty, MinLength, MaxLength, Matches, IsUUID, IsOptional, IsDateString, IsInt } from 'class-validator';

export class CreateParentDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  fullName!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[6-9]\d{9}$/, { message: 'phone must be a valid 10-digit mobile number' })
  phone!: string;

  @IsString()
  @IsNotEmpty({ message: "Enter the child's name." })
  @MaxLength(100)
  childName!: string;

  /** Child's class from the school's class master (school_classes.id). */
  @IsInt({ message: 'Select the child\'s class.' })
  childClassId!: number;

  /** Child's section (class_sections.id); must belong to childClassId. */
  @IsInt({ message: 'Select the child\'s section.' })
  childSectionId!: number;

  /** The parent's assigned pickup point. Required — a parent can't sign in without one. */
  @IsUUID(undefined, { message: 'Select a pickup point (bus stop) for this parent.' })
  routeStopId!: string;

  /** The parent's own subscription expiry (ISO date). Past date blocks their login. */
  @IsOptional()
  @IsDateString()
  subscriptionExpiresAt?: string;
}
