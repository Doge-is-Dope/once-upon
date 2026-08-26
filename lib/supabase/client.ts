'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;

export function hasSupabaseConfig(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export function getSupabaseClient(): SupabaseClient {
  if (browserClient) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase is not configured. Add the public project URL and publishable key.');
  browserClient = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return browserClient;
}

export async function ensureAnonymousSession(): Promise<string> {
  const client = getSupabaseClient();
  const { data: current, error: currentError } = await client.auth.getSession();
  if (currentError) throw currentError;
  if (current.session) {
    client.realtime.setAuth(current.session.access_token);
    return current.session.user.id;
  }
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.session) throw error ?? new Error('Anonymous sign-in did not return a session.');
  client.realtime.setAuth(data.session.access_token);
  return data.session.user.id;
}
