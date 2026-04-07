import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RequestFriendshipDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  receiverId: string;
}
