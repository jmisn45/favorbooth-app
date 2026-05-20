// app/api/gallery/[groupId]/route.ts
// GET /api/gallery/[groupId]
// Fetch all gallery items for a guest group (public endpoint)

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getPresignedDownloadUrl, getPublicUrl } from '@/lib/r2';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params;

    if (!groupId || typeof groupId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid group ID' },
        { status: 400 }
      );
    }

    // Get gallery items for this group
    const itemsResult = await db`
      SELECT
        id,
        file_path,
        file_type,
        created_at
      FROM gallery_items
      WHERE group_id = ${groupId}
      ORDER BY
        CASE WHEN file_type = 'strip' THEN 0 ELSE 1 END,
        created_at ASC
    `;

    if (!itemsResult || itemsResult.length === 0) {
      return NextResponse.json(
        { error: 'Gallery not found' },
        { status: 404 }
      );
    }

    // Build response with URLs
    const items = await Promise.all(
      itemsResult.map(async (item: any) => {
        let url: string;

        try {
          // Try to use presigned URL (works with both public and private buckets)
          url = await getPresignedDownloadUrl(
            item.file_path.split('/')[1], // vendor_id
            item.file_path.split('/')[2], // event_id
            item.file_path.split('/')[4]  // filename
          );
        } catch (error) {
          // Fallback to public URL
          console.warn('Failed to generate presigned URL, using public URL:', error);
          url = getPublicUrl(
            item.file_path.split('/')[1],
            item.file_path.split('/')[2],
            item.file_path.split('/')[4]
          );
        }

        return {
          id: item.id,
          filePath: item.file_path,
          fileType: item.file_type,
          url,
          createdAt: item.created_at,
        };
      })
    );

    return NextResponse.json(
      {
        groupId,
        items,
        count: items.length,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Gallery fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
