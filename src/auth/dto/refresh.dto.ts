import { IsOptional, IsString } from 'class-validator';

/** Body for /auth/refresh and /auth/logout — the refresh token the client stored at login. */
export class RefreshDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
