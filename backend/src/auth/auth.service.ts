import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  LoginResponseDto,
  MicrosoftTokenResponse,
  MicrosoftUserProfile,
} from './dto/auth.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { UserService } from '../user/user.service';

// Consistent scopes used across auth URL and token exchange
const MICROSOFT_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'User.Read',
  'Calendars.Read',
  'Calendars.ReadWrite',
];

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly MICROSOFT_OAUTH_URL: string;
  private readonly MICROSOFT_TOKEN_URL: string;
  private readonly MICROSOFT_GRAPH_URL = 'https://graph.microsoft.com/v1.0/me';

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
  ) {
    const tenantId = this.configService.get<string>('MICROSOFT_TENANT_ID', 'common');
    this.MICROSOFT_OAUTH_URL = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`;
    this.MICROSOFT_TOKEN_URL = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  }

  /**
   * Handles Microsoft OAuth callback
   * Exchanges authorization code for tokens and creates/updates user
   */
  async handleMicrosoftCallback(code: string, redirectUri: string): Promise<LoginResponseDto> {
    // Step 1: Exchange code for Microsoft tokens
    this.logger.log(`Exchanging code for tokens with redirect URI: ${redirectUri}`);
    const msTokens = await this.exchangeCodeForToken(code, redirectUri);

    // Step 2: Get user profile from Microsoft Graph
    this.logger.log('Fetching user profile from Microsoft Graph...');
    const msProfile = await this.getUserProfile(msTokens.access_token);

    const email = msProfile.mail || msProfile.userPrincipalName;
    this.logger.log(`Got user profile: ${email}`);

    // Step 3: Create or update user in database
    const user = await this.userService.findOrCreate({
      email,
      name: msProfile.displayName,
      microsoftId: msProfile.id,
      accessToken: msTokens.access_token,
      refreshToken: msTokens.refresh_token || '',
    });

    // Step 4: Generate JWT tokens
    const tokens = await this.generateTokens(
      user._id.toString(),
      user.email,
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      user: {
        userId: user._id.toString(),
        email: user.email,
      },
    };
  }

  /**
   * Exchanges Microsoft authorization code for access and refresh tokens
   */
  private async exchangeCodeForToken(
    code: string,
    redirectUri: string,
  ): Promise<MicrosoftTokenResponse> {
    const clientId = this.configService.get<string>('MICROSOFT_CLIENT_ID') || '';
    const clientSecret = this.configService.get<string>('MICROSOFT_CLIENT_SECRET') || '';

    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      scope: MICROSOFT_SCOPES.join(' '),
    });

    this.logger.log(`Token exchange URL: ${this.MICROSOFT_TOKEN_URL}`);
    this.logger.log(`Token exchange redirect_uri: ${redirectUri}`);
    this.logger.log(`Token exchange client_id: ${clientId}`);

    try {
      const response = await axios.post<MicrosoftTokenResponse>(
        this.MICROSOFT_TOKEN_URL,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      this.logger.log('Token exchange successful');
      return response.data;
    } catch (error: any) {
      // Log the REAL Microsoft error response for debugging
      const msError = error.response?.data;
      this.logger.error(
        `Token exchange failed: ${JSON.stringify(msError || error.message)}`,
      );
      this.logger.error(`Status: ${error.response?.status}`);
      throw new BadRequestException(
        `Token exchange failed: ${msError?.error_description || msError?.error || error.message}`,
      );
    }
  }

  /**
   * Fetches user profile from Microsoft Graph API
   */
  private async getUserProfile(
    accessToken: string,
  ): Promise<MicrosoftUserProfile> {
    try {
      const response = await axios.get<MicrosoftUserProfile>(
        this.MICROSOFT_GRAPH_URL,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      return response.data;
    } catch (error: any) {
      const msError = error.response?.data;
      this.logger.error(
        `Graph API profile fetch failed: ${JSON.stringify(msError || error.message)}`,
      );
      throw new BadRequestException(
        `Failed to fetch user profile: ${msError?.error?.message || error.message}`,
      );
    }
  }

  /**
   * Refreshes JWT tokens using a valid refresh token
   */
  async refreshTokens(refreshToken: string): Promise<LoginResponseDto> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      const tokens = await this.generateTokens(payload.userId, payload.email);

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        user: {
          userId: payload.userId,
          email: payload.email,
        },
      };
    } catch (error: any) {
      this.logger.error(`Failed to refresh tokens: ${error.message}`);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Generates JWT access and refresh tokens
   */
  async generateTokens(
    userId: string,
    email: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    const payload: JwtPayload = { userId, email };

    const accessTokenExpiresIn = this.configService.get<number>(
      'JWT_EXPIRATION_TIME',
      3600,
    );
    const refreshTokenExpiresIn = this.configService.get<number>(
      'JWT_REFRESH_EXPIRATION_TIME',
      604800,
    );

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        expiresIn: accessTokenExpiresIn,
        secret: this.configService.get<string>('JWT_SECRET'),
      }),
      this.jwtService.signAsync(payload, {
        expiresIn: refreshTokenExpiresIn,
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: accessTokenExpiresIn,
    };
  }

  /**
   * Complete logout — clears Microsoft tokens from DB, disabling cron-based services
   */
  async completeLogout(userId: string): Promise<void> {
    await this.userService.updateTokens(userId, null, null);
    this.logger.log(`Cleared Microsoft tokens for user ${userId}`);
  }

  /**
   * Builds Microsoft OAuth authorization URL
   */
  getMicrosoftAuthUrl(redirectUri: string): string {
    const clientId = this.configService.get<string>('MICROSOFT_CLIENT_ID') || '';

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: MICROSOFT_SCOPES.join(' '),
      response_mode: 'query',
      prompt: 'select_account',
    });

    return `${this.MICROSOFT_OAUTH_URL}?${params.toString()}`;
  }
}
