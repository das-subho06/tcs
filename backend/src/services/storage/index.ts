import { StorageService } from './types';
import { LocalStorageService } from './localStorage';
import { config } from '../../config';

let storageInstance: StorageService;

if (config.storage.driver === 'local') {
  storageInstance = new LocalStorageService();
} else {
  // S3 or other drivers can be plugged here
  storageInstance = new LocalStorageService();
}

export const storage = storageInstance;
export * from './types';
