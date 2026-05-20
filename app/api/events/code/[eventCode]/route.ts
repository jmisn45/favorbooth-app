// app/api/events/code/[eventCode]/route.ts
// GET /api/events/code/[eventCode]
// Called by FavorBooth Electron to resolve event code

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventCode: string }> }
) {
  try {
    const { eventCode } = await params;

    if (!eventCode || typeof eventCode !== 'string') {
      return NextResponse.json(
        { error: 'Invalid event code' },
        { status: 400 }
      );
    }

    // Get event and vendor
    const eventResult = await db`
      SELECT
        e.id,
        e.name,
        e.vendor_id,
        e.active_favor_type_ids
      FROM events e
      WHERE e.event_code = ${eventCode} AND e.is_active = true
      LIMIT 1
    `;

    if (!eventResult || eventResult.length === 0) {
      return NextResponse.json(
        { error: 'Event code not found' },
        { status: 404 }
      );
    }

    const event = eventResult[0];
    const favorTypeIds = event.active_favor_type_ids || [];

    // Get vendor name
    const vendorResult = await db`
      SELECT id, name FROM vendors WHERE id = ${event.vendor_id}
      LIMIT 1
    `;

    const vendor = vendorResult && vendorResult.length > 0 ? vendorResult[0] : null;

    // Get favor types for this event
    let favorTypes: any[] = [];
    if (favorTypeIds.length > 0) {
      const result = await db`
        SELECT id, name, aspect_ratio, width_px, height_px
        FROM favor_types
        WHERE id = ANY(${favorTypeIds}::uuid[]) AND is_active = true
        ORDER BY sort_order ASC
      `;
      favorTypes = result || [];
    }

    return NextResponse.json(
      {
        eventId: event.id,
        eventName: event.name,
        vendorId: event.vendor_id,
        vendorName: vendor?.name || 'Unknown',
        favorTypes,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Event lookup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
