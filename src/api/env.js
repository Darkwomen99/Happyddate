// src/api/env.js
export const config = { runtime: 'edge' };

export default async function handler(_req) {
  const payload = {
    SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
    SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null,
    SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? null,
    // Ні в якому разі не виводимо SERVICE_ROLE ключ!
  };

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*', // зручно для локальної перевірки
    },
  });
}
