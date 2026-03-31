import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Res,
  Req,
  Query,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import {
  LoginResponseDto,
  RefreshTokenDto,
  UserDto,
} from './dto/auth.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@ApiTags('authentication')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  /**
   * Initiates Microsoft OAuth login flow
   * Redirects to Microsoft login page
   */
  @Get('microsoft')
  @ApiOperation({ summary: 'Initiate Microsoft OAuth login (redirect)' })
  @ApiOkResponse({ description: 'Redirects to Microsoft login page' })
  @ApiBadRequestResponse({ description: 'Invalid redirect URI' })
  microsoftLogin(
    @Query('redirectUri') redirectUri: string | undefined,
    @Res() res: Response,
  ): void {
    try {
      const callbackRedirectUri = redirectUri || this.getDefaultRedirectUri();

      if (!this.isValidRedirectUri(callbackRedirectUri)) {
        throw new BadRequestException('Invalid redirect URI');
      }

      const authUrl = this.authService.getMicrosoftAuthUrl(callbackRedirectUri);
      res.redirect(authUrl);
    } catch (error: any) {
      this.logger.error(`Microsoft login error: ${error.message}`);
      res.status(400).json({ error: 'Failed to initiate login' });
    }
  }

  /**
   * Returns the Microsoft OAuth URL as JSON
   * Used by the frontend SPA to get the URL before redirecting client-side
   */
  @Get('microsoft-auth-url')
  @ApiOperation({ summary: 'Get Microsoft OAuth URL as JSON' })
  @ApiOkResponse({ description: 'Returns the Microsoft auth URL' })
  getMicrosoftAuthUrl() {
    const redirectUri = this.getDefaultRedirectUri();
    const authUrl = this.authService.getMicrosoftAuthUrl(redirectUri);
    return { data: { authUrl } };
  }

  /**
   * Handles Microsoft OAuth callback
   * Exchanges authorization code for tokens
   */
  @Get('callback')
  @ApiOperation({ summary: 'Handle Microsoft OAuth callback' })
  @ApiOkResponse({
    description: 'Successfully authenticated',
    type: LoginResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid authorization code or state' })
  async microsoftCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('error_description') errorDescription: string,
    @Res() res: Response,
    @Req() req: Request,
  ): Promise<void> {
    const frontendUrl =
      process.env.FRONTEND_URL || 'http://localhost:3000';

    try {
      // Check for OAuth errors — redirect to frontend with error
      if (error) {
        this.logger.warn(
          `Microsoft OAuth error: ${error} - ${errorDescription}`,
        );
        res.redirect(
          `${frontendUrl}/login/callback?error=${encodeURIComponent(error)}&error_description=${encodeURIComponent(errorDescription || '')}`,
        );
        return;
      }

      if (!code) {
        res.redirect(`${frontendUrl}/login/callback?error=missing_code`);
        return;
      }

      const redirectUri = this.getDefaultRedirectUri();
      const result = await this.authService.handleMicrosoftCallback(
        code,
        redirectUri,
      );

      // Redirect to frontend callback page with tokens as query params
      const params = new URLSearchParams({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn.toString(),
        userId: result.user.userId,
        email: result.user.email,
      });

      res.redirect(`${frontendUrl}/login/callback?${params.toString()}`);
    } catch (err: any) {
      const errorMsg = err.response?.message || err.message || 'Authentication failed';
      this.logger.error(`OAuth callback error: ${errorMsg}`, err.stack);
      res.redirect(
        `${frontendUrl}/login/callback?error=${encodeURIComponent(errorMsg)}`,
      );
    }
  }

  /**
   * Refreshes JWT tokens using a valid refresh token
   */
  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiOkResponse({
    description: 'Tokens refreshed successfully',
    type: LoginResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid refresh token' })
  async refreshTokens(
    @Body() dto: RefreshTokenDto,
  ): Promise<LoginResponseDto> {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  /**
   * Logs out the current user
   * If complete=true, also clears Microsoft tokens from DB (disables cron jobs)
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout current user' })
  @ApiOkResponse({ description: 'Logged out successfully' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing token' })
  async logout(
    @CurrentUser() user: JwtPayload,
    @Body() body: { complete?: boolean },
  ) {
    if (body.complete) {
      await this.authService.completeLogout(user.userId);
      this.logger.log(`User ${user.email} performed complete logout (Microsoft tokens cleared)`);
      return { message: 'Complete logout successful — background services disabled' };
    }

    this.logger.log(`User ${user.email} logged out (app only)`);
    return { message: 'Logged out successfully' };
  }

  /**
   * Gets the current authenticated user
   * Protected endpoint - requires valid JWT
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiOkResponse({
    description: 'User profile retrieved successfully',
    type: UserDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing token' })
  async getCurrentUser(@CurrentUser() user: JwtPayload): Promise<UserDto> {
    return {
      userId: user.userId,
      email: user.email,
    };
  }

  /**
   * Validates redirect URI against whitelist
   */
  private isValidRedirectUri(uri: string): boolean {
    try {
      new URL(uri);
      const allowedHosts = [
        'localhost',
        'localhost:3000',
        'localhost:3001',
        process.env.FRONTEND_URL || '',
      ].filter(Boolean);

      const url = new URL(uri);
      return allowedHosts.some(
        (host) =>
          url.hostname === host.split(':')[0] ||
          url.origin === `http://${host}` ||
          url.origin === `https://${host}`,
      );
    } catch {
      return false;
    }
  }

  /**
   * Gets default redirect URI from config
   */
  private getDefaultRedirectUri(): string {
    return (
      process.env.MICROSOFT_REDIRECT_URI ||
      'http://localhost:4000/auth/callback'
    );
  }
}
