import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return supabaseClient;
}

export async function uploadFile(
  bucket: string,
  path: string,
  buffer: Buffer,
  contentType: string
): Promise<{ url: string; path: string }> {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, {
      contentType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(data.path);
  
  return {
    url: publicUrlData.publicUrl,
    path: data.path,
  };
}

export async function deleteFile(bucket: string, path: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) {
    throw new Error(`Delete failed: ${error.message}`);
  }
}

export async function createSignedUrl(bucket: string, path: string, expiresIn: number = 3600): Promise<string> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) {
    throw new Error(`Signed URL creation failed: ${error.message}`);
  }
  return data.signedUrl;
}

export function getPublicUrl(bucket: string, path: string): string {
  const supabase = getSupabaseClient();
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadUserPhoto(
  userId: string,
  buffer: Buffer,
  mimeType: string
): Promise<{ url: string; path: string }> {
  const ext = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : 'webp';
  const path = `users/${userId}/photos/${Date.now()}.${ext}`;
  return uploadFile(env.STORAGE_BUCKET, path, buffer, mimeType);
}

export async function uploadPackAsset(
  packId: string,
  type: string,
  buffer: Buffer,
  mimeType: string
): Promise<{ url: string; path: string }> {
  const ext = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : 'webp';
  const path = `packs/${packId}/${type}/${Date.now()}.${ext}`;
  return uploadFile(env.STORAGE_BUCKET, path, buffer, mimeType);
}

export async function uploadGeneratedImage(
  projectId: string,
  buffer: Buffer,
  format: string
): Promise<{ url: string; path: string }> {
  const path = `generations/${projectId}/${Date.now()}.${format}`;
  return uploadFile(env.STORAGE_BUCKET, path, buffer, `image/${format}`);
}

export async function uploadTempFile(
  buffer: Buffer,
  mimeType: string
): Promise<{ url: string; path: string }> {
  const ext = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : 'webp';
  const path = `temp/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  return uploadFile(env.STORAGE_BUCKET, path, buffer, mimeType);
}

export async function cleanupTempFiles(olderThanHours: number = 24): Promise<number> {
  const supabase = getSupabaseClient();
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
  
  const { data: files, error } = await supabase.storage
    .from(env.STORAGE_BUCKET)
    .list('temp', { limit: 1000 });

  if (error || !files) return 0;

  const oldFiles = files
    .filter((f) => f.created_at != null && new Date(f.created_at) < cutoff)
    .map((f) => `temp/${f.name}`);

  if (oldFiles.length === 0) return 0;

  const { error: deleteError } = await supabase.storage
    .from(env.STORAGE_BUCKET)
    .remove(oldFiles);

  if (deleteError) {
    throw new Error(`Cleanup failed: ${deleteError.message}`);
  }

  return oldFiles.length;
}