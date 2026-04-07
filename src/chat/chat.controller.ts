import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';
import { MessagesQueryDto } from './dto/messages-query.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('chat')
@ApiBearerAuth()
@Controller('chat')
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Post('matches/:matchId/open')
  @HttpCode(HttpStatus.OK)
  openChat(
    @CurrentUser() user: { id: string },
    @Param('matchId') matchId: string,
  ) {
    return this.chatService.openChat(matchId, user.id);
  }

  @Get()
  getMyChats(@CurrentUser() user: { id: string }) {
    return this.chatService.getMyChats(user.id);
  }

  @Get(':chatId/messages')
  getMessages(
    @CurrentUser() user: { id: string },
    @Param('chatId') chatId: string,
    @Query() query: MessagesQueryDto,
  ) {
    return this.chatService.getMessages(chatId, user.id, query);
  }

  @Post(':chatId/messages')
  sendMessage(
    @CurrentUser() user: { id: string },
    @Param('chatId') chatId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.sendMessage(chatId, user.id, dto);
  }
}
