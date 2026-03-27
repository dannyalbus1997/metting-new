import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';
import { UserService } from './user.service';
import { UserDocument } from './schemas/user.schema';

@ApiTags('users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * Get current user profile
   * Requires valid JWT authentication
   */
  @Get('me')
  @UseGuards() // Add JwtAuthGuard here when authentication module is ready
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get current user profile',
    description: 'Returns the profile information of the currently authenticated user',
  })
  @ApiOkResponse({
    description: 'User profile retrieved successfully',
    schema: {
      example: {
        _id: '507f1f77bcf86cd799439011',
        email: 'user@example.com',
        name: 'John Doe',
        microsoftId: '12345678-1234-1234-1234-123456789012',
        avatar: 'https://example.com/avatar.jpg',
        createdAt: '2026-03-25T10:00:00.000Z',
        updatedAt: '2026-03-25T10:00:00.000Z',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - missing or invalid authentication token',
  })
  @ApiInternalServerErrorResponse({
    description: 'Internal server error',
  })
  async getProfile(@Request() req: any): Promise<Partial<UserDocument>> {
    // Extract user ID from JWT token (when auth guard is implemented)
    // For now, assuming req.user.id is set by authentication middleware
    const userId = req.user?.id;

    if (!userId) {
      throw new Error('User ID not found in request');
    }

    const user = await this.userService.findById(userId);

    // Return user without sensitive tokens
    const { accessToken, refreshToken, ...userProfile } = user;
    return userProfile;
  }
}
