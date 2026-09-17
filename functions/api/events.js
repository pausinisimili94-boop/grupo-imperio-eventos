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

/**
 * Respuesta JSON estándar.
 * Se deshabilita caché mientras terminamos las pruebas.
 */
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache"
    }
  });
}

/**
 * Une líneas continuadas de archivos iCalendar.
 */
function unfoldICS(text) {
  return text
    .replace(/\r\n[ \t]/g, "")
    .replace(/\n[ \t]/g, "");
}

/**
 * Convierte fechas ICS:
 *
 * 20260916
 * 20260916T200000
 * 20260916T200000Z
 *
 * en:
 *
 * 2026-09-16
 */
function extractDate(value) {
  if (!value) {
    return null;
  }

  const match = String(value).match(
    /(\d{4})(\d{2})(\d{2})/
  );

  if (!match) {
    return null;
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}

/**
 * Suma días sin depender de la zona horaria del servidor.
 */
function addDays(dateString, amount) {
  const [year, month, day] =
    dateString.split("-").map(Number);

  const date = new Date(
    Date.UTC(year, month - 1, day)
  );

  date.setUTCDate(
    date.getUTCDate() + amount
  );

  return date.toISOString().slice(0, 10);
}

/**
 * Convierte el calendario Google ICS en fechas ocupadas.
 *
 * IMPORTANTE:
 * No devuelve nombres de clientes,
 * títulos privados ni descripción del evento.
 */
function parseCalendar(icsText) {
  const unfolded = unfoldICS(icsText);

  const blocks =
    unfolded.match(
      /BEGIN:VEVENT[\s\S]*?END:VEVENT/g
    ) || [];

  const occupiedDates = new Set();

  for (const block of blocks) {

    // No publicar eventos cancelados.
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

    const startRaw =
      startMatch[1].trim();

    const endRaw =
      endMatch
        ? endMatch[1].trim()
        : null;

    const startDate =
      extractDate(startRaw);

    const endDate =
      extractDate(endRaw);

    if (!startDate) {
      continue;
    }

    /**
     * Ejemplo:
     *
     * DTSTART;VALUE=DATE:20260920
     * DTEND;VALUE=DATE:20260921
     */
    const isAllDay =
      /DTSTART;[^:\r\n]*VALUE=DATE/i
        .test(block);

    if (isAllDay && endDate) {

      // DTEND en iCalendar es exclusivo.
      let current = startDate;

      while (current < endDate) {
        occupiedDates.add(current);
        current = addDays(current, 1);
      }

    } else {

      /**
       * Eventos con horario.
       *
       * Ejemplo:
       * 16 Sep 20:00 - 23:30
       *
       * Marca el 16 como ocupado.
       */
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

/**
 * Cloudflare Pages Function
 *
 * URL:
 * /api/events
 */
export async function onRequest({
  request,
  env
}) {

  /**
   * Solo permitimos GET.
   */
  if (request.method !== "GET") {
    return json(
      {
        error: "Método no permitido."
      },
      405
    );
  }

  /**
   * Obtiene la dirección secreta iCal
   * almacenada en Cloudflare.
   */
  const calendarUrl = String(
    env.GOOGLE_CALENDAR_ICS_URL || ""
  ).trim();

  /**
   * Si Cloudflare no encuentra la variable.
   */
  if (!calendarUrl) {
    return json({
      events: FALLBACK_EVENTS,
      source: "fallback",
      configured: false,
      diagnostic: {
        stage: "missing-variable",
        message:
          "GOOGLE_CALENDAR_ICS_URL no está configurada."
      }
    });
  }

  try {

    /**
     * Consulta Google Calendar.
     *
     * NO mostramos nunca calendarUrl
     * porque contiene una dirección secreta.
     */
    const response = await fetch(
      calendarUrl,
      {
        redirect: "follow",
        headers: {
          "Accept":
            "text/calendar,text/plain,*/*"
        }
      }
    );

    const contentType =
      response.headers.get(
        "content-type"
      ) || "desconocido";

    /**
     * Google respondió,
     * pero con error HTTP.
     *
     * Ejemplos:
     * 403
     * 404
     * 500
     */
    if (!response.ok) {
      return json({
        events: FALLBACK_EVENTS,
        source: "fallback",
        configured: true,
        diagnostic: {
          stage: "google-response",
          status: response.status,
          statusText:
            response.statusText || "",
          contentType
        }
      });
    }

    /**
     * Leemos el archivo ICS.
     */
    const ics =
      await response.text();

    /**
     * Verificamos que realmente
     * Google nos haya entregado
     * un calendario iCalendar.
     */
    const looksLikeCalendar =
      ics
        .trimStart()
        .startsWith(
          "BEGIN:VCALENDAR"
        );

    if (!looksLikeCalendar) {
      return json({
        events: FALLBACK_EVENTS,
        source: "fallback",
        configured: true,
        diagnostic: {
          stage: "invalid-content",
          status: response.status,
          contentType,
          bodyLength: ics.length,
          message:
            "La URL respondió, pero no entregó un archivo iCalendar válido."
        }
      });
    }

    /**
     * Extraemos únicamente las fechas.
     */
    const googleEvents =
      parseCalendar(ics);

    /**
     * Sincronización correcta.
     */
    return json({
      events: googleEvents,
      source: "google-calendar",
      configured: true,
      count: googleEvents.length,
      diagnostic: {
        stage: "success",
        status: response.status,
        contentType
      }
    });

  } catch (error) {

    /**
     * Error de red o ejecución.
     */
    return json({
      events: FALLBACK_EVENTS,
      source: "fallback",
      configured: true,
      diagnostic: {
        stage: "fetch-error",
        message: String(
          error?.message || error
        )
      }
    });
  }
}
