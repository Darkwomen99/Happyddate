// api/reminders.js — HappyDate Reminder Sender (Supabase + Resend, optimized)
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

// Day.js setup
dayjs.extend(utc);
dayjs.extend(timezone);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  // 1) Безпека: перевірка секрету
  if (req.headers['x-reminders-secret'] !== process.env.REMINDERS_SECRET) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    // 2) Поточна дата в таймзоні (Europe/Warsaw)
    const today = dayjs().tz('Europe/Warsaw').format('YYYY-MM-DD');

    // 3) Витягуємо події на сьогодні + email користувача
    const { data: events, error } = await supabase
      .from('events')
      .select(`id, title, type, person, date, profiles ( email )`)
      .eq('date', today);

    if (error) throw error;
    if (!events?.length) return res.json({ status: 'No events today' });

    let sent = 0;

    for (const ev of events) {
      const email = ev.profiles?.email;
      if (!email) continue;

      const title = ev.title || 'Wydarzenie';
      const person = ev.person || 'Bliska osoba';
      const type = ev.type || 'inne';

      const subject = `Przypomnienie: ${person} — ${title} 🎉`;
      const html = `
        <h2>Cześć!</h2>
        <p>Przypominamy o ważnym wydarzeniu dzisiaj:</p>
        <ul>
          <li><b>Osoba:</b> ${person}</li>
          <li><b>Rodzaj:</b> ${type}</li>
          <li><b>Data:</b> ${ev.date}</li>
        </ul>
        <p>Sprawdź szczegóły w swoim kalendarzu HappyDate:</p>
        <a href="${process.env.PUBLIC_BASE_URL}/pages/dashboard.html"
           style="color:white;background:#3b82f6;padding:10px 18px;border-radius:8px;text-decoration:none">
           Otwórz kalendarz
        </a>
      `;

      try {
        await resend.emails.send({
          from: 'HappyDate <hello@happydate.pl>',
          to: email,
          subject,
          html
        });
        sent++;
      } catch (mailErr) {
        console.error(`❌ Błąd wysyłania do ${email}:`, mailErr.message);
      }
    }

    return res.json({ status: 'OK', sent });
  } catch (err) {
    console.error('❌ Błąd główny:', err);
    return res.status(500).json({ error: err.message });
  }
}
