import { upload, uploadPresigned } from '@vercel/blob/client';
export { upload, uploadPresigned };
if (typeof window !== 'undefined') {
  window.VercelBlobClient = { upload, uploadPresigned };
}
