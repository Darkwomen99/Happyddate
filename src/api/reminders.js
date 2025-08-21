import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // тільки на сервері!
);
const resend = new Resend(process.env.RESEND_API_KEY);

// Обчислюємо "сьогодні" у зоні Європа/Варшава
function getTodayWarsaw() {
  const now = new Date();
  // Отримаємо локальний час Варшави як рядок і створимо з нього Date-об'єкт
  const warsawNow = new Date(now.toLocaleString('en-CA', { timeZone: 'Europe/Warsaw', hour12: false }));
  const y = warsawNow.getFullYear();
  const m = String(warsawNow.getMonth() + 1).padStart(2, '0');
  const d = String(warsawNow.getDate()).padStart(2, '0');
  const dayStart = new Date(`${y}-${m}-${d}T00:00:00+02:00`); // просте наближення (літо CEST)
  const dayEnd   = new Date(`${y}-${m}-${d}T23:59:59+02:00`);
  const isoDate = `${y}-${m}-${d}`;
  return { isoDate, dayStart, dayEnd };
}

export default async function handler(req, res) {
  try {
    // Захист: тільки з секретом
    if (req.headers['x-reminders-secret'] !== process.env.REMINDERS_SECRET) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { isoDate } = getTodayWarsaw();

    // Вибираємо події на сьогодні + email користувача (через service_role)
    const { data, error } = await supabase
      .from('events')
      .select('id, uid, title, date, enabled, profiles:uid(email, full_name)')
      .eq('date', isoDate)
      .eq('enabled', true);

    if (error) throw error;

    const jobs = (data || []).map(async (ev) => {
      const email = ev.profiles?.email;
      if (!email) return;

      await resend.emails.send({
        from: 'HappyDate <reminder@happydate.pl>',
        to: email,
        subject: `Dzisiejsze wydarzenie: ${ev.title}`,
        html: `<p>Cześć! Dziś masz wydarzenie: <b>${ev.title}</b>.</p>
               <p>Wejdź do kalendarza: <a href="https://YOUR-APP.vercel.app/dashboard.html">HappyDate</a></p>`
      });
    });

    await Promise.all(jobs);
    return res.status(200).json({ ok: true, sent: jobs.length });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err) });
  }
}
