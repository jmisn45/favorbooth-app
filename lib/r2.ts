// lib/r2.ts
// Cloudflare R2 utilities for presigned URLs

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'favorbooth';
const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ENDPOINT) {
  throw new Error('R2 environment variables are not properly configured');
}

// Initialize S3 client for R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// Generate presigned PUT URL for uploading
export async function getPresignedUploadUrl(
  vendorId: string,
  eventId: string,
  filename: string,
  contentType: string = 'image/jpeg',
  expiresIn: number = 3600
): Promise<string> {
  const key = `events/${vendorId}/${eventId}/photos/${filename}`;

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn });
  return url;
}

// Generate public URL for accessing a file (if bucket is public)
export function getPublicUrl(
  vendorId: string,
  eventId: string,
  filename: string
): string {
  const key = `events/${vendorId}/${eventId}/photos/${filename}`;

  // If public URL is configured, use it
  if (R2_PUBLIC_URL) {
    return `${R2_PUBLIC_URL}/${key}`;
  }

  // Otherwise use default R2 public URL
  return `https://${R2_BUCKET_NAME}.${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;
}

// Generate presigned GET URL for accessing a file
export async function getPresignedDownloadUrl(
  vendorId: string,
  eventId: string,
  filename: string,
  expiresIn: number = 3600
): Promise<string> {
  const key = `events/${vendorId}/${eventId}/photos/${filename}`;

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn });
  return url;
}

// Validate file path is within vendor's event
export function validateFilePath(vendorId: string, eventId: string, filePath: string): boolean {
  const expectedPrefix = `events/${vendorId}/${eventId}/photos/`;
  return filePath.startsWith(expectedPrefix);
}

// Extract filename from file path
export function extractFilename(filePath: string): string {
  return filePath.split('/').pop() || '';
}

// Test R2 connection
export async function testR2Connection(): Promise<boolean> {
  try {
    const testKey = 'test-connection.txt';
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: testKey,
      Body: 'test',
    });

    await s3Client.send(command);
    return true;
  } catch (error) {
    console.error('R2 connection test failed:', error);
    return false;
  }
}
