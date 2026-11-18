import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PushToken } from './push-token.entity';
import { PushService } from './push.service';
import { PushController } from './push.controller';
import { PushSchemaPatch } from './push-schema.patch';

@Module({
  imports: [TypeOrmModule.forFeature([PushToken])],
  controllers: [PushController],
  providers: [PushSchemaPatch, PushService],
  exports: [PushService],
})
export class PushModule {}
