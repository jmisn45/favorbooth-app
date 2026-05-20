// lib/db.ts
// Database connection utility for Neon

import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

export const db = postgres(process.env.DATABASE_URL);

// Helper function to execute queries
export async function query(text: string, params?: any[]) {
  try {
    return await db(text, params);
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

// Type definitions for database results
export type Vendor = {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  slug: string;
  created_at: Date;
  updated_at: Date;
  is_active: boolean;
};

export type FavorType = {
  id: string;
  vendor_id: string;
  name: string;
  aspect_ratio: string;
  width_px: number;
  height_px: number;
  price?: number;
  is_active: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
};

export type Event = {
  id: string;
  vendor_id: string;
  name: string;
  client_name?: string;
  event_date?: string;
  event_code: string;
  active_favor_type_ids: string[];
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

export type GalleryGroup = {
  id: string;
  event_id: string;
  vendor_id: string;
  group_id: string;
  phone_number?: string;
  created_at: Date;
};

export type GalleryItem = {
  id: string;
  event_id: string;
  group_id: string;
  file_path: string;
  file_type: 'photo' | 'strip';
  created_at: Date;
};

export type FavorJob = {
  id: string;
  event_id: string;
  vendor_id: string;
  favor_type_id: string;
  group_id: string;
  guest_number?: number;
  image_path: string;
  favor_side: 'front' | 'back';
  source: 'booth' | 'upload';
  status: 'pending' | 'printing' | 'complete' | 'error';
  error_message?: string;
  created_at: Date;
  updated_at: Date;
};
