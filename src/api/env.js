// /api/env.js (Vercel Function)
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // ЦІ змінні додай у Vercel → Project → Settings → Environment Variables
  res.status(200).json({
    SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}
