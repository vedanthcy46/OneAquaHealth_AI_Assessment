import { v2 as cloudinary } from 'cloudinary';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env';

// ── Cloudinary configuration ──────────────────────────────────────────────────
const cloudinaryEnabled =
  !!env.CLOUDINARY_CLOUD_NAME && !!env.CLOUDINARY_API_KEY && !!env.CLOUDINARY_API_SECRET;

if (cloudinaryEnabled) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key:    env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure:     true,
  });
  console.log('☁️  Cloudinary media storage: ENABLED');
} else {
  console.log('💾  Cloudinary not configured — using local disk storage (development only)');
}

export interface UploadResult {
  mediaId:      string;
  url:          string;
  hash:         string;
  mimeType:     string;
  fileSizeBytes: number;
  publicId?:    string;  // Cloudinary public_id for deletion
}

export class StorageService {
  /**
   * Upload a media file (image or video) from a base64 data URL or a local file path.
   * In production (Cloudinary configured): uploads to Cloudinary CDN.
   * In development (no keys):              saves to backend/uploads/ on disk.
   */
  async uploadMedia(
    observationId: string,
    dataUrl: string,          // base64 data: URL   OR   absolute file path
    mimeType: string = 'image/jpeg',
    options?: { qualityScore?: number; qualityFactors?: Record<string, unknown> }
  ): Promise<UploadResult> {
    const mediaId = uuidv4();
    const isVideo = mimeType.startsWith('video/');
    const resourceType: 'image' | 'video' | 'raw' = isVideo ? 'video' : 'image';

    // ── Extract binary buffer from data URL ─────────────────────────────────
    let buffer: Buffer;
    if (dataUrl.startsWith('data:')) {
      const matches = dataUrl.match(/^data:([A-Za-z-+\/0-9]+);base64,(.+)$/);
      if (matches) {
        mimeType = matches[1];
        buffer   = Buffer.from(matches[2], 'base64');
      } else {
        buffer = Buffer.from(dataUrl.split(',')[1] || dataUrl, 'base64');
      }
    } else {
      // treat as raw base64
      buffer = Buffer.from(dataUrl, 'base64');
    }

    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const ext  = isVideo ? 'mp4' : (mimeType.includes('png') ? 'png' : 'jpg');

    // ── Cloudinary upload ───────────────────────────────────────────────────
    if (cloudinaryEnabled) {
      const folder = `aquaguard/observations/${observationId}`;

      const result = await new Promise<any>((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            folder,
            public_id: mediaId,
            resource_type: resourceType,
            // Auto-optimise images; Cloudinary serves WebP/AVIF automatically
            transformation: isVideo ? [] : [{ quality: 'auto', fetch_format: 'auto' }],
            tags: ['aquaguard', observationId],
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        ).end(buffer);
      });

      return {
        mediaId,
        url:           result.secure_url,
        hash,
        mimeType,
        fileSizeBytes: result.bytes ?? buffer.length,
        publicId:      result.public_id,
      };
    }

    // ── Local disk fallback (development) ──────────────────────────────────
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const filename = `${observationId}_${mediaId}.${ext}`;
    const filePath = path.join(uploadsDir, filename);
    fs.writeFileSync(filePath, buffer);

    const publicUrl = `http://localhost:${env.PORT}/uploads/${filename}`;

    return {
      mediaId,
      url:           publicUrl,
      hash,
      mimeType,
      fileSizeBytes: buffer.length,
    };
  }

  /**
   * Delete a media file from Cloudinary (or local disk).
   * publicId is the Cloudinary public_id returned by uploadMedia().
   */
  async deleteMedia(publicId: string, mimeType: string = 'image/jpeg'): Promise<void> {
    if (cloudinaryEnabled && publicId && !publicId.startsWith('/uploads/')) {
      const resourceType = mimeType.startsWith('video/') ? 'video' : 'image';
      await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
      return;
    }
    // Local disk fallback
    const filename = path.basename(publicId);
    const filePath = path.join(process.cwd(), 'uploads', filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  /** Returns true when Cloudinary is active (production mode). */
  isCloudinaryEnabled(): boolean {
    return cloudinaryEnabled;
  }
}

export const storageService = new StorageService();
