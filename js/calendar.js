// js/calendar.js – obsługa dodawania wydarzeń do Firestore
import { db } from './firebaseConfig.js';

export function initCalendar(user) {
  const calendarEl = document.getElementById('calendar');
  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth',
    selectable: true,
    dateClick(info) {
      const title = prompt('Dodaj nazwę wydarzenia:');
      const type = prompt('Typ: birthday / anniversary / custom', 'custom');
      const person = prompt('Kogo dotyczy prezent?', 'Mama');
      if (title && type && person) {
        db.collection('events').add({
          uid: user.uid,
          title,
          date: info.dateStr,
          type,
          person
        }).then(() => calendar.refetchEvents());
      }
    },
    events: async function (fetchInfo, successCallback) {
      const typeFilter = document.getElementById('filter-type')?.value || 'all';
      let ref = db.collection('events').where('uid', '==', user.uid);
      if (typeFilter !== 'all') ref = ref.where('type', '==', typeFilter);
      const snapshot = await ref.get();
      const events = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          title: `${data.person} 🎁`,
          start: data.date,
          color: data.type === 'birthday' ? '#3b82f6' : data.type === 'anniversary' ? '#ec4899' : '#10b981'
        };
      });
      successCallback(events);
      renderEventsList(snapshot.docs);
    }
  });
  calendar.render();

  document.getElementById('filter-type').addEventListener('change', () => calendar.refetchEvents());
}
