const FALLBACK_EVENTS = [
  {
    date: "2026-09-20",
    title: "Fecha ocupada",
    category: "Evento agendado"
  },
  {
    date: "2026-09-26",
    title: "Fecha ocupada",
    category: "Evento agendado"
  }
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function unfoldICS(text) {
  // En iCalendar una línea puede continuar en la siguiente
  return text
    .replace(/\r\n[ \t]/g, "")
    .replace(/\n[ \t]/g, "");
}

function extractDate(value) {
  if (!value) return null;

  // Ejemplos:
  // 20260916
  // 20260916T200000
  // 20260916T200000Z
  const match = value.match(/(\d{4})(\d{2})(\d{2})/);

  if (!match) return null;

  return `${match[1]}-${match[2]}-${match[3]}`;
}

function addDays(dateString, amount) {
  const [year, month, day] = dateString.split("-").map(Number);

  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + amount);

  return date.toISOString().slice(0, 10);
}

function parseCalendar(icsText) {
  const unfolded = unfoldICS(icsText);

  const blocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];

  const occupiedDates = new Set();

  for (const block of blocks) {
    // Ignorar eventos cancelados
    if (/STATUS:CANCELLED/i.test(block)) {
      continue;
    }

    const startMatch = block.match(
      /^DTSTART(?:;[^:]*)?:(.+)$/mi
    );

    const endMatch = block.match(
      /^DTEND(?:;[^:]*)?:(.+)$/mi
    );

    if (!startMatch) {
      continue;
    }

    const startRaw = startMatch[1].trim();
    const endRaw = endMatch ? endMatch[1].trim() : null;

    const startDate = extractDate(startRaw);
    const endDate = extractDate(endRaw);

    if (!startDate) {
      continue;
    }

    // Evento de todo el día:
    // DTSTART;VALUE=DATE:20260916
    // DTEND;VALUE=DATE:20260917
    const isAllDay = /DTSTART;[^:\r\n]*VALUE=DATE/i.test(block);

    if (isAllDay && endDate) {
      // En ICS, DTEND para eventos de día completo es exclusivo.
      let current = startDate;

      while (current < endDate) {
        occupiedDates.add(current);
        current = addDays(current, 1);
      }
    } else {
      // Evento con horario: se marca el día de inicio como ocupado.
      occupiedDates.add(startDate);
    }
  }

  return Array.from(occupiedDates)
    .sort()
    .map(date => ({
      date,
      title: "Fecha ocupada",
      category: "Evento agendado"
    }));
}

export async function onRequest({ request, env }) {
  if (request.method !== "GET") {
    return json(
      {
        error: "Método no permitido."
      },
      405
    );
  }

  const calendarUrl = String(
    env.GOOGLE_CALENDAR_ICS_URL || ""
  ).trim();

  if (!calendarUrl) {
    return json({
      events: FALLBACK_EVENTS,
      source: "fallback",
      configured: false,
      warning: "GOOGLE_CALENDAR_ICS_URL no está configurada."
    });
  }

  try {
    const response = await fetch(calendarUrl, {
      headers: {
        "User-Agent": "GrupoImperioAgenda/1.0",
        "Accept": "text/calendar,text/plain,*/*"
      }
    });

    if (!response.ok) {
      throw new Error(
        `Google Calendar respondió HTTP ${response.status}`
      );
    }

    const ics = await response.text();

    const googleEvents = parseCalendar(ics);

    return json({
      events: googleEvents,
      source: "google-calendar",
      configured: true,
      count: googleEvents.length
    });

  } catch (error) {
    console.error(
      "Error sincronizando Google Calendar:",
      error
    );

    return json({
      events: FALLBACK_EVENTS,
      source: "fallback",
      configured: true,
      warning: "No fue posible consultar Google Calendar."
    });
  }
}
