import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class LoyaltyTransactionsQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ['EARN', 'REDEEM', 'ADJUST'] })
  @IsOptional()
  @IsIn(['EARN', 'REDEEM', 'ADJUST'])
  type?: 'EARN' | 'REDEEM' | 'ADJUST';

  @ApiPropertyOptional({ description: 'ISO date from (inclusive)' })
  @IsOptional()
  @IsString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'ISO date to (inclusive)' })
  @IsOptional()
  @IsString()
  toDate?: string;

  @ApiPropertyOptional({ description: 'Filter by order id' })
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional({ description: 'Filter by user id' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'Free-text user search (name/phone/email)', deprecated: true })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : String(value)))
  userSearch?: string;
}
