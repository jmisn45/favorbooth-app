// app/api/jobs/route.ts
// GET /api/jobs - Poll for pending jobs (FavorPrint)
// POST /api/jobs - Create favor job (FavorBooth)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { extractToken, verifyToken } from '@/lib/auth';
import { db } from '@/lib/db';

// POST request schema
const CreateJobSchema = z.object({
  eventId: z.string().uuid(),
  favorTypeId: z.string().uuid(),
  groupId: z.string(),
  guestNumber: z.number().int().positive().optional(),
  imagePath: z.string(),
  favorSide: z.enum(['front', 'back']),
  source: z.enum(['booth', 'upload']),
});

// GET request schema (query params)
const PollJobsSchema = z.object({
  eventId: z.string().uuid(),
  status: z.string().default('pending'),
});

export async function GET(request: NextRequest) {
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

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');
    const status = searchParams.get('status') || 'pending';

    if (!eventId) {
      return NextResponse.json(
        { error: 'Missing eventId query parameter' },
        { status: 400 }
      );
    }

    // Verify vendor owns this event
    const eventResult = await db`
      SELECT vendor_id FROM events
      WHERE id = ${eventId}
      LIMIT 1
    `;

    if (!eventResult || eventResult.length === 0) {
      return NextResponse.json(
        { error: 'Event not found' },
        { status: 404 }
      );
    }

    const vendorId = eventResult[0].vendor_id;

    // Verify request vendor owns event
    if (vendorId !== payload.vendorId) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Get pending jobs (order by created_at for FIFO)
    const jobsResult = await db`
      SELECT
        id,
        event_id,
        favor_type_id,
        group_id,
        guest_number,
        image_path,
        favor_side,
        source,
        status,
        created_at
      FROM favor_jobs
      WHERE event_id = ${eventId} AND status = ${status}
      ORDER BY created_at ASC
      LIMIT 100
    `;

    const jobs = (jobsResult || []).map((job: any) => ({
      id: job.id,
      eventId: job.event_id,
      favorTypeId: job.favor_type_id,
      groupId: job.group_id,
      guestNumber: job.guest_number,
      imagePath: job.image_path,
      favorSide: job.favor_side,
      source: job.source,
      status: job.status,
      createdAt: job.created_at,
    }));

    return NextResponse.json(
      {
        jobs,
        count: jobs.length,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Jobs poll error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

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
    const { eventId, favorTypeId, groupId, guestNumber, imagePath, favorSide, source } =
      CreateJobSchema.parse(body);

    // Verify vendor owns this event
    const eventResult = await db`
      SELECT vendor_id FROM events
      WHERE id = ${eventId} AND vendor_id = ${vendorId}
      LIMIT 1
    `;

    if (!eventResult || eventResult.length === 0) {
      return NextResponse.json(
        { error: 'Event not found or access denied' },
        { status: 404 }
      );
    }

    // Verify favor type belongs to vendor
    const favorTypeResult = await db`
      SELECT id FROM favor_types
      WHERE id = ${favorTypeId} AND vendor_id = ${vendorId}
      LIMIT 1
    `;

    if (!favorTypeResult || favorTypeResult.length === 0) {
      return NextResponse.json(
        { error: 'Favor type not found' },
        { status: 404 }
      );
    }

    // Create job (idempotent - won't create duplicate)
    const result = await db`
      INSERT INTO favor_jobs (
        event_id,
        vendor_id,
        favor_type_id,
        group_id,
        guest_number,
        image_path,
        favor_side,
        source,
        status
      )
      VALUES (
        ${eventId},
        ${vendorId},
        ${favorTypeId},
        ${groupId},
        ${guestNumber || null},
        ${imagePath},
        ${favorSide},
        ${source},
        'pending'
      )
      ON CONFLICT (event_id, image_path, favor_side) DO NOTHING
      RETURNING id, status, created_at
    `;

    const job = result && result.length > 0 ? result[0] : null;

    if (!job) {
      // Job already exists, return it
      const existingResult = await db`
        SELECT id, status, created_at FROM favor_jobs
        WHERE event_id = ${eventId} AND image_path = ${imagePath} AND favor_side = ${favorSide}
        LIMIT 1
      `;

      const existing = existingResult && existingResult.length > 0 ? existingResult[0] : null;

      return NextResponse.json(
        {
          jobId: existing?.id,
          status: existing?.status || 'pending',
          createdAt: existing?.created_at,
          isNew: false,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        jobId: job.id,
        status: job.status,
        createdAt: job.created_at,
        isNew: true,
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

    console.error('Jobs create error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
