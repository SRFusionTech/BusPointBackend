import { Transform } from 'class-transformer';
import {
  Equals,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { BUS_RANGES, CONTACT_METHODS, SCHOOL_TYPES, STUDENT_RANGES, TIME_WINDOWS } from '../demo-request.entity';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToUndefined = ({ value }: { value: unknown }) => (typeof value === 'string' && value.trim() === '' ? undefined : typeof value === 'string' ? value.trim() : value);

/** Public "Request a demo" form (marketing site). */
export class CreateDemoRequestDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  schoolName!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  city!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  country!: string;

  @IsOptional()
  @IsIn(SCHOOL_TYPES)
  schoolType?: string;

  @IsOptional()
  @IsIn(STUDENT_RANGES)
  studentRange?: string;

  @IsOptional()
  @IsIn(BUS_RANGES)
  busRange?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUrl({ require_protocol: false }, { message: 'website must be a valid URL' })
  @MaxLength(255)
  website?: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  contactName!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  contactRole!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'email must be a valid work email' })
  @MaxLength(255)
  email!: string;

  /** International format: + then 8–15 digits. */
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/[\s()-]/g, '') : value))
  @Matches(/^\+[1-9]\d{7,14}$/, { message: 'phone must include the country code, e.g. +971 50 123 4567' })
  phone!: string;

  @IsOptional()
  @IsIn(CONTACT_METHODS)
  preferredContact?: string;

  @IsOptional()
  @IsIn(TIME_WINDOWS)
  preferredTime?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(2000)
  message?: string;

  @Equals(true, { message: 'consent is required' })
  consent!: boolean;

  // ── Anti-spam (never shown to real users) ─────────────────────────────────
  /** Honeypot: hidden field; bots fill it. Must stay empty. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyFax?: string;

  /** ms the visitor spent on the form (client-measured). */
  @IsOptional()
  @IsInt()
  @Min(0)
  elapsedMs?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  source?: string;

  @IsOptional()
  @IsObject()
  utm?: Record<string, string>;
}

