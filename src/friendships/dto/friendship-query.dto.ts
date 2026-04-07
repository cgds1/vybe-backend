import { IsOptional, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FriendshipStatus } from '@prisma/client';

export class FriendshipQueryDto {
  @ApiPropertyOptional({ enum: FriendshipStatus })
  @IsOptional()
  @IsEnum(FriendshipStatus)
  status?: FriendshipStatus;
}
