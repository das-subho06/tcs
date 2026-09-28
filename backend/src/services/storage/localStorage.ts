import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { StorageService } from './types';
import { config } from '../../config';

export class LocalStorageService implements StorageService {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || config.storage.localDir;
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  async saveFile(key: string, content: Buffer | Readable): Promise<string> {
    const fullPath = this.getFilePath(key);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (Buffer.isBuffer(content)) {
      await fs.promises.writeFile(fullPath, content);
    } else {
      const writeStream = fs.createWriteStream(fullPath);
      await new Promise<void>((resolve, reject) => {
        content.pipe(writeStream);
        writeStream.on('finish', () => resolve());
        writeStream.on('error', reject);
      });
    }

    return fullPath;
  }

  async getFile(key: string): Promise<Buffer> {
    const fullPath = this.getFilePath(key);
    return fs.promises.readFile(fullPath);
  }

  getFilePath(key: string): string {
    return path.join(this.baseDir, key);
  }

  async deleteFile(key: string): Promise<void> {
    const fullPath = this.getFilePath(key);
    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath);
    }
  }

  async exists(key: string): Promise<boolean> {
    const fullPath = this.getFilePath(key);
    return fs.existsSync(fullPath);
  }

  getPublicUrl(key: string): string {
    // Served via Express static /uploads route
    return `/uploads/${key}`;
  }
}
