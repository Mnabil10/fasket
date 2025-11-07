import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nameAr?: string;
  @ApiProperty() @IsString() slug!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() imageUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean = true;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number = 0;
  @ApiPropertyOptional() @IsOptional() @IsString() parentId?: string;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

/** 👈 add this so you can use ?q=... in /admin/categories */
export class CategoryQueryDto extends PartialType(UpdateCategoryDto) {
  @ApiPropertyOptional({ description: 'search by name' })
  @IsOptional() @IsString()
  q?: string;
}
