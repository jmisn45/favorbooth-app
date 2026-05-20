// app/api/jobs/[jobId]/route.ts
// PATCH /api/jobs/[jobId]
// Update job status

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { extractToken, verifyToken } from '@/lib/auth';
import { db } from '@/lib/db';

const UpdateJobSchema = z.object({
  status: z.enum(['pending', 'printing', 'complete', 'error']),
  errorMessage: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
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
    const { jobId } = await params;

    if (!jobId || typeof jobId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid job ID' },
        { status: 400 }
      );
    }

    // Parse and validate request
    const body = await request.json();
    const { status, errorMessage } = UpdateJobSchema.parse(body);

    // Get job and verify vendor owns it
    const jobResult = await db`
      SELECT id, vendor_id, event_id FROM favor_jobs
      WHERE id = ${jobId}
      LIMIT 1
    `;

    if (!jobResult || jobResult.length === 0) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    const job = jobResult[0];

    // Verify vendor owns this job
    if (job.vendor_id !== vendorId) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Update job status
    const result = await db`
      UPDATE favor_jobs
      SET
        status = ${status},
        error_message = ${errorMessage || null},
        updated_at = NOW()
      WHERE id = ${jobId}
      RETURNING id, status, error_message, updated_at
    `;

    if (!result || result.length === 0) {
      throw new Error('Failed to update job');
    }

    const updatedJob = result[0];

    return NextResponse.json(
      {
        id: updatedJob.id,
        status: updatedJob.status,
        errorMessage: updatedJob.error_message,
        updatedAt: updatedJob.updated_at,
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

    console.error('Job update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
