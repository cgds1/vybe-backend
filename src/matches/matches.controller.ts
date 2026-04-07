import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { MatchesService } from './matches.service';
import { SwipeDto } from './dto/swipe.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('matches')
@ApiBearerAuth()
@Controller('matches')
export class MatchesController {
  constructor(private matchesService: MatchesService) {}

  @Post('swipe')
  swipe(@CurrentUser() user: { id: string }, @Body() dto: SwipeDto) {
    return this.matchesService.swipe(user.id, dto);
  }

  @Get()
  getMyMatches(@CurrentUser() user: { id: string }) {
    return this.matchesService.getMyMatches(user.id);
  }

  @Get(':id')
  getMatchById(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.matchesService.getMatchById(id, user.id);
  }
}
