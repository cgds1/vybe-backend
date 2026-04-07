import { IsIn, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SwipeDto {
  @ApiProperty()
  @IsString()
  targetId: string;

  @ApiProperty({ enum: ['LIKE', 'PASS'] })
  @IsIn(['LIKE', 'PASS'])
  action: 'LIKE' | 'PASS';
}
