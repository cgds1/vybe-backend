import {
  Controller,
  Post,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { RegisterTokenDto } from './dto/register-token.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('token')
  @ApiOperation({ summary: 'Register FCM device token' })
  registerToken(
    @CurrentUser() user: { id: string },
    @Body() dto: RegisterTokenDto,
  ) {
    return this.notificationsService.registerToken(user.id, dto);
  }

  @Delete('token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove FCM device token' })
  removeToken(@CurrentUser() user: { id: string }) {
    return this.notificationsService.removeToken(user.id);
  }
}
