import {
  BadRequestException, Controller, Get, Post, Query,
  UploadedFile, UseInterceptors, ParseFilePipe, MaxFileSizeValidator, FileTypeValidator,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UploadsService } from './uploads.service';
import { AdminOnly } from '../admin/_admin-guards';
import { Express } from 'express';

@ApiTags('Admin/Uploads')
@ApiBearerAuth()
@AdminOnly()
@Controller({ path: 'admin/uploads', version: ['1'] })
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Get('health')
  @ApiOkResponse({ description: 'Checks S3 bucket accessibility' })
  health() {
    return this.uploads.checkHealth();
  }

  @Get('signed-url')
  @ApiQuery({ name: 'filename', required: true })
  @ApiQuery({ name: 'contentType', required: true, enum: ['image/jpeg','image/png','image/webp'] })
  @ApiOkResponse({ description: 'Returns presigned PUT URL and final public URL' })
  async signedUrl(@Query('filename') filename?: string, @Query('contentType') contentType?: string) {
    if (!filename || !contentType) throw new BadRequestException('filename and contentType are required');
    return this.uploads.createSignedUrl({ filename, contentType });
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024) },
    fileFilter: (req, file, cb) => {
      const allowed = String(process.env.UPLOAD_ALLOWED_MIME || 'image/jpeg,image/png,image/webp')
        .split(',').map(s => s.trim());
      if (!allowed.includes(file.mimetype)) return cb(new BadRequestException('Unsupported content type') as any, false);
      cb(null, true);
    },
  }))
  @ApiOkResponse({ description: 'Uploads a file and returns its public URL' })
  async multipart(
    @UploadedFile(new ParseFilePipe({
      validators: [
        new MaxFileSizeValidator({ maxSize: Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024) }),
        new FileTypeValidator({ fileType: /(image\/jpeg|image\/png|image\/webp)$/ })
      ],
    })) file: Express.Multer.File,
  ) {
    return this.uploads.uploadBuffer(file);
  }
}
