import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { createS3Client } from './s3.client';
import { S3_CLIENT } from './uploads.constants';

@Module({
  controllers: [UploadsController],
  providers: [
    UploadsService,
    { provide: S3_CLIENT, useFactory: createS3Client }, // ✅ make the token available
  ],
  exports: [UploadsService],
})
export class UploadsModule {}
