import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class FirebaseAuthDto {
  @IsString()
  @IsNotEmpty()
  firebaseToken: string;

  // Optional FCM token for push notifications
  @IsString()
  @IsOptional()
  fcmToken?: string;
}
