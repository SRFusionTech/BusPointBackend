import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  token!: string;

  @IsOptional()
  @IsIn(['fcm'])
  provider?: 'fcm';

  @IsOptional()
  @IsString()
  @MaxLength(16)
  platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  appVersion?: string | null;
}

export class RemovePushTokenDto {
  @IsString()
  @MaxLength(4096)
  token!: string;
}
