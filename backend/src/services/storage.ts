import * as AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env';

const s3 = new AWS.S3({
  endpoint:        env.S3_ENDPOINT || undefined,
  accessKeyId:     env.S3_ACCESS_KEY,
  secretAccessKey: env.S3_SECRET_KEY,
  region:          env.S3_REGION,
  s3ForcePathStyle: true,
  signatureVersion: 'v4',
});

export class StorageService {
  async getPresignedUploadUrl(
    observationId: string,
    mimeType: string = 'image/jpeg'
  ): Promise<{ uploadUrl: string; key: string; publicUrl: string }> {
    const ext = mimeType === 'image/png' ? 'png' : 'jpg';
    const key = `observations/${observationId}/${uuidv4()}.${ext}`;

    const uploadUrl = await s3.getSignedUrlPromise('putObject', {
      Bucket:      env.S3_BUCKET,
      Key:         key,
      ContentType: mimeType,
      Expires:     3600, // 1 hour
    });

    const publicUrl = env.S3_ENDPOINT
      ? `${env.S3_ENDPOINT}/${env.S3_BUCKET}/${key}`
      : `https://${env.S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com/${key}`;

    return { uploadUrl, key, publicUrl };
  }

  async deleteObject(key: string): Promise<void> {
    await s3.deleteObject({ Bucket: env.S3_BUCKET, Key: key }).promise();
  }

  async getSignedDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
    return s3.getSignedUrlPromise('getObject', {
      Bucket:  env.S3_BUCKET,
      Key:     key,
      Expires: expiresIn,
    });
  }
}

export const storageService = new StorageService();
