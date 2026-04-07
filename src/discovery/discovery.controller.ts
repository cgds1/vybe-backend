import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DiscoveryService } from './discovery.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('discovery')
@ApiBearerAuth()
@Controller('discovery')
export class DiscoveryController {
  constructor(private discoveryService: DiscoveryService) {}

  @Get()
  getDiscoveryFeed(@CurrentUser() user: { id: string }) {
    return this.discoveryService.getDiscoveryFeed(user.id);
  }
}
