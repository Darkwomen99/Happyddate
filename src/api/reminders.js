// api/reminders.js
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// Підключення до Supabase (змінні з Vercel → Settings → Environment Variables)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // потрібен service_role, а не anon
);

// Підключення до Resend (для e-mail)
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  // Захист: дозволяємо тільки якщо переданий секретний ключ
  if (req.headers['x-reminders-secret'] !== process.env.REMINDERS_SECRET) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    // 1) Беремо сьогоднішню дату (формат YYYY-MM-DD)
    const today = new Date().toISOString().split('T')[0];

    // 2) Вибираємо всі події на сьогодні + e-mail користувача
    const { data: events, error } = await supabase
      .from('events')
      .select(`
        id, title, type, person, date,
        profiles ( email )
      `)
      .eq('date', today);

    if (error) throw error;

    if (!events || events.length === 0) {
      return res.json({ status: 'No events today' });
    }

    // 3) Відправляємо e-mail кожному користувачу
    for (const ev of events) {
      if (!ev.profiles?.email) continue;

      await resend.emails.send({
        from: 'HappyDate <onboarding@resend.dev>', // для тесту
        to: ev.profiles.email,
        subject: `Przypomnienie: ${ev.person} — ${ev.title || 'Wydarzenie'} 🎉`,
        html: `
          <h2>Cześć!</h2>
          <p>Przypominamy o ważnym wydarzeniu dzisiaj:</p>
          <ul>
            <li><b>Osoba:</b> ${ev.person}</li>
            <li><b>Rodzaj:</b> ${ev.type}</li>
            <li><b>Data:</b> ${ev.date}</li>
          </ul>
          <p>Sprawdź szczegóły w swoim kalendarzu HappyDate:</p>
          <a href="${process.env.PUBLIC_BASE_URL}/pages/dashboard.html"
             style="color:white;background:#3b82f6;padding:10px 18px;border-radius:8px;text-decoration:none">
             Otwórz kalendarz
          </a>
        `
      });
    }

    // 4) Відповідь API
    res.json({ status: 'OK', sent: events.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
