import { Readable } from 'stream';

export interface StorageService {
  saveFile(key: string, content: Buffer | Readable): Promise<string>;
  getFile(key: string): Promise<Buffer>;
  getFilePath(key: string): string;
  deleteFile(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getPublicUrl(key: string): string;
}
