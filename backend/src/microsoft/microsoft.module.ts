/**
 * Microsoft Graph Integration Module
 * Exports MicrosoftService for use across the application
 */

import { Module } from '@nestjs/common';
import { MicrosoftService } from './microsoft.service';

@Module({
  providers: [MicrosoftService],
  exports: [MicrosoftService],
})
export class MicrosoftModule {}
