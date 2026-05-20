// app/api/auth/login/route.ts
// POST /api/auth/login

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { generateToken, comparePassword, extractToken } from '@/lib/auth';

// Request validation schema
const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = LoginSchema.parse(body);

    // Find vendor by email
    const result = await db`
      SELECT id, email, password_hash, name, slug
      FROM vendors
      WHERE email = ${email} AND is_active = true
      LIMIT 1
    `;

    if (!result || result.length === 0) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const vendor = result[0];

    // Compare password
    const passwordValid = await comparePassword(password, vendor.password_hash);
    if (!passwordValid) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Generate session token
    const sessionToken = generateToken(vendor.id, vendor.email);

    return NextResponse.json(
      {
        sessionToken,
        vendorId: vendor.id,
        vendorName: vendor.name,
        vendorSlug: vendor.slug,
        email: vendor.email,
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

    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
