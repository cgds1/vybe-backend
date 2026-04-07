import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FriendshipsService } from './friendships.service';
import { RequestFriendshipDto } from './dto/request-friendship.dto';
import { FriendshipQueryDto } from './dto/friendship-query.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('friendships')
@ApiBearerAuth()
@Controller('friendships')
export class FriendshipsController {
  constructor(private friendshipsService: FriendshipsService) {}

  @Post('request')
  request(@CurrentUser() user: { id: string }, @Body() dto: RequestFriendshipDto) {
    return this.friendshipsService.request(user.id, dto);
  }

  @Get('pending')
  findPending(@CurrentUser() user: { id: string }) {
    return this.friendshipsService.findPending(user.id);
  }

  @Get()
  findAll(@CurrentUser() user: { id: string }, @Query() query: FriendshipQueryDto) {
    return this.friendshipsService.findAll(user.id, query);
  }

  @Patch(':id/accept')
  accept(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.friendshipsService.accept(id, user.id);
  }

  @Patch(':id/block')
  block(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.friendshipsService.block(id, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.friendshipsService.remove(id, user.id);
  }
}
