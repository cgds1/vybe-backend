import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CloudinaryProvider } from './cloudinary.provider';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';

@Module({
  imports: [PrismaModule],
  providers: [CloudinaryProvider, FilesService],
  controllers: [FilesController],
})
export class FilesModule {}
