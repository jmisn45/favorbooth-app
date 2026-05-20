// app/api/gallery/items/route.ts
// POST /api/gallery/items
// Register gallery items after uploading to R2

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { extractToken, verifyToken } from '@/lib/auth';
import { db } from '@/lib/db';

const GalleryItemSchema = z.object({
  filePath: z.string(),
  fileType: z.enum(['photo', 'strip']),
});

const RegisterItemsSchema = z.object({
  eventId: z.string().uuid(),
  groupId: z.string(),
  items: z.array(GalleryItemSchema).min(1),
  phoneNumber: z.string().optional(),
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
    const { eventId, groupId, items, phoneNumber } = RegisterItemsSchema.parse(body);

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

    // Create or get gallery group
    const groupResult = await db`
      INSERT INTO gallery_groups (event_id, vendor_id, group_id, phone_number)
      VALUES (${eventId}, ${vendorId}, ${groupId}, ${phoneNumber || null})
      ON CONFLICT (event_id, group_id) DO UPDATE
      SET phone_number = COALESCE(EXCLUDED.phone_number, gallery_groups.phone_number)
      RETURNING id
    `;

    const groupIdRow = groupResult && groupResult.length > 0 ? groupResult[0] : null;

    if (!groupIdRow) {
      throw new Error('Failed to create/get gallery group');
    }

    // Insert gallery items
    const itemIds: string[] = [];

    for (const item of items) {
      try {
        const result = await db`
          INSERT INTO gallery_items (event_id, group_id, file_path, file_type)
          VALUES (${eventId}, ${groupId}, ${item.filePath}, ${item.fileType})
          ON CONFLICT (event_id, file_path) DO NOTHING
          RETURNING id
        `;

        if (result && result.length > 0) {
          itemIds.push(result[0].id);
        }
      } catch (error) {
        console.error('Error inserting gallery item:', error);
        // Continue with other items
      }
    }

    const groupUrl = `${process.env.NEXT_PUBLIC_API_URL || 'https://favorbooth.app'}/gallery/${groupId}`;

    return NextResponse.json(
      {
        itemIds,
        groupId,
        groupUrl,
        createdAt: new Date().toISOString(),
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Gallery items error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
