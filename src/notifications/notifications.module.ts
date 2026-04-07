import { Module } from '@nestjs/common';
import { FirebaseAdminProvider } from './firebase.provider';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';

@Module({
  providers: [FirebaseAdminProvider, NotificationsService],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
