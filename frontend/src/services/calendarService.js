import { supabase } from './supabase';

class CalendarService {
  async getProviderToken() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.provider_token) {
      throw new Error('Google token not found. You must login with Google repeatedly to keep calendar access active, or your current plan does not support it.');
    }
    return session.provider_token;
  }

  async createEvent(eventDetails) {
    /* 
      eventDetails: {
        summary: 'Pagar Conta de Luz',
        description: 'Gerado por Lume Finanças',
        start: { dateTime: '2023-11-20T09:00:00-03:00' },
        end: { dateTime: '2023-11-20T10:00:00-03:00' }
      }
    */
    const token = await this.getProviderToken();

    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventDetails),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'Erro ao sincronizar com Google Calendar');
    }

    return await response.json();
  }
}

export const calendarService = new CalendarService();
export default calendarService;
