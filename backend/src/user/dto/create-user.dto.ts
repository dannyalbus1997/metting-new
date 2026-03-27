import { IsEmail, IsNotEmpty, IsString, IsOptional, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
  })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'User full name',
    example: 'John Doe',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'name must be at least 2 characters long' })
  name: string;

  @ApiProperty({
    description: 'Microsoft Azure AD user ID',
    example: '12345678-1234-1234-1234-123456789012',
  })
  @IsString()
  @IsNotEmpty()
  microsoftId: string;

  @ApiProperty({
    description: 'Microsoft OAuth access token',
  })
  @IsString()
  @IsNotEmpty()
  accessToken: string;

  @ApiProperty({
    description: 'Microsoft OAuth refresh token',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;

  @ApiPropertyOptional({
    description: 'User avatar URL',
    example: 'https://example.com/avatar.jpg',
  })
  @IsString()
  @IsOptional()
  avatar?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional({
    description: 'User full name',
    example: 'Jane Doe',
  })
  @IsString()
  @MinLength(2, { message: 'name must be at least 2 characters long' })
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'Microsoft OAuth access token',
  })
  @IsString()
  @IsOptional()
  accessToken?: string;

  @ApiPropertyOptional({
    description: 'Microsoft OAuth refresh token',
  })
  @IsString()
  @IsOptional()
  refreshToken?: string;

  @ApiPropertyOptional({
    description: 'User avatar URL',
    example: 'https://example.com/avatar.jpg',
  })
  @IsString()
  @IsOptional()
  avatar?: string;
}
