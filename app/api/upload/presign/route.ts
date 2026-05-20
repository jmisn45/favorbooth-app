// app/api/upload/presign/route.ts
// POST /api/upload/presign
// Get presigned R2 URL for uploading

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { extractToken, verifyToken } from '@/lib/auth';
import { getPresignedUploadUrl } from '@/lib/r2';
import { db } from '@/lib/db';

const PresignSchema = z.object({
  eventId: z.string().uuid(),
  filename: z.string().min(5).max(255),
  contentType: z.string().default('image/jpeg'),
});

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('authorization');
    const token = extractToken(authHeader);

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized: Missing token' },
        { status: 401 }
      );
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid token' },
        { status: 401 }
      );
    }

    const vendorId = payload.vendorId;

    // Parse and validate request
    const body = await request.json();
    const { eventId, filename, contentType } = PresignSchema.parse(body);

    // Verify vendor owns this event
    const eventResult = await db`
      SELECT id FROM events
      WHERE id = ${eventId} AND vendor_id = ${vendorId}
      LIMIT 1
    `;

    if (!eventResult || eventResult.length === 0) {
      return NextResponse.json(
        { error: 'Event not found or access denied' },
        { status: 404 }
      );
    }

    // Generate presigned URL
    const url = await getPresignedUploadUrl(
      vendorId,
      eventId,
      filename,
      contentType,
      3600 // 1 hour expiry
    );

    return NextResponse.json(
      {
        url,
        expiresIn: 3600,
      },
      { status: 200 }
    );
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Presign error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
