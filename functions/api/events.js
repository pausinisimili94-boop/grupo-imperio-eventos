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
 * ============================================================
 * RESPUESTA JSON
 * ============================================================
 */
function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        "Content-Type":
          "application/json; charset=utf-8",

        // Durante las pruebas evitamos caché.
        "Cache-Control":
          "no-store, no-cache, must-revalidate",

        "Pragma": "no-cache"
      }
    }
  );
}


/**
 * ============================================================
 * DESDOBLAR LÍNEAS ICS
 * ============================================================
 *
 * En iCalendar una propiedad muy larga puede continuar
 * en la siguiente línea.
 */
function unfoldICS(text) {
  return String(text || "")
    .replace(/\r\n[ \t]/g, "")
    .replace(/\n[ \t]/g, "");
}


/**
 * ============================================================
 * CONVERTIR FECHA UTC A MÉXICO
 * ============================================================
 *
 * Ejemplo:
 *
 * Google puede mandar:
 * 20260917T020000Z
 *
 * Eso en UTC corresponde a:
 * 16 de septiembre 20:00 en Morelia.
 */
function utcToMexicoDate(raw) {

  const year =
    Number(raw.slice(0, 4));

  const month =
    Number(raw.slice(4, 6));

  const day =
    Number(raw.slice(6, 8));

  const hour =
    Number(raw.slice(9, 11));

  const minute =
    Number(raw.slice(11, 13));

  const second =
    Number(raw.slice(13, 15));


  const utcDate = new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      hour,
      minute,
      second
    )
  );


  const formatter =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "America/Mexico_City",

        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }
    );


  const parts =
    formatter.formatToParts(
      utcDate
    );


  const values = {};

  for (const part of parts) {

    if (part.type !== "literal") {
      values[part.type] =
        part.value;
    }

  }


  return (
    `${values.year}-` +
    `${values.month}-` +
    `${values.day}`
  );
}


/**
 * ============================================================
 * EXTRAER FECHA DE GOOGLE CALENDAR
 * ============================================================
 *
 * Admite:
 *
 * 20260916
 *
 * 20260916T200000
 *
 * 20260917T020000Z
 */
function extractDate(value) {

  if (!value) {
    return null;
  }


  const raw =
    String(value).trim();


  /**
   * ----------------------------------------------------------
   * EVENTO DE DÍA COMPLETO
   * ----------------------------------------------------------
   *
   * Ejemplo:
   *
   * 20260916
   */
  if (
    /^\d{8}$/.test(raw)
  ) {

    return (
      `${raw.slice(0, 4)}-` +
      `${raw.slice(4, 6)}-` +
      `${raw.slice(6, 8)}`
    );

  }


  /**
   * ----------------------------------------------------------
   * EVENTO EN UTC
   * ----------------------------------------------------------
   *
   * Ejemplo:
   *
   * 20260917T020000Z
   *
   * Convertimos explícitamente
   * a America/Mexico_City.
   */
  if (
    /^\d{8}T\d{6}Z$/.test(raw)
  ) {

    return utcToMexicoDate(raw);

  }


  /**
   * ----------------------------------------------------------
   * EVENTO CON HORARIO LOCAL
   * ----------------------------------------------------------
   *
   * Ejemplo:
   *
   * 20260916T200000
   *
   * Cuando Google especifica TZID,
   * el valor puede venir sin Z.
   *
   * En ese caso conservamos la fecha
   * indicada por el calendario.
   */
  const match =
    raw.match(
      /^(\d{4})(\d{2})(\d{2})/
    );


  if (!match) {
    return null;
  }


  return (
    `${match[1]}-` +
    `${match[2]}-` +
    `${match[3]}`
  );
}


/**
 * ============================================================
 * SUMAR DÍAS
 * ============================================================
 *
 * Usado para eventos de día completo
 * que abarcan más de una fecha.
 */
function addDays(
  dateString,
  amount
) {

  const [
    year,
    month,
    day
  ] =
    dateString
      .split("-")
      .map(Number);


  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );


  date.setUTCDate(
    date.getUTCDate() +
    amount
  );


  return date
    .toISOString()
    .slice(0, 10);
}


/**
 * ============================================================
 * INTERPRETAR GOOGLE CALENDAR ICS
 * ============================================================
 *
 * IMPORTANTE:
 *
 * No exponemos:
 *
 * - nombres de clientes;
 * - teléfonos;
 * - notas;
 * - ubicaciones;
 * - títulos privados.
 *
 * La web únicamente recibe:
 *
 * Fecha ocupada.
 */
function parseCalendar(icsText) {

  const unfolded =
    unfoldICS(icsText);


  const blocks =
    unfolded.match(
      /BEGIN:VEVENT[\s\S]*?END:VEVENT/g
    ) || [];


  const occupiedDates =
    new Set();


  for (const block of blocks) {

    /**
     * Ignorar eventos cancelados.
     */
    if (
      /STATUS:CANCELLED/i.test(block)
    ) {
      continue;
    }


    /**
     * Buscar DTSTART.
     *
     * Ejemplos:
     *
     * DTSTART:20260917T020000Z
     *
     * DTSTART;TZID=America/Mexico_City:
     * 20260916T200000
     *
     * DTSTART;VALUE=DATE:20260916
     */
    const startMatch =
      block.match(
        /^DTSTART(?:;[^:]*)?:(.+)$/mi
      );


    /**
     * Buscar DTEND.
     */
    const endMatch =
      block.match(
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
     * Detectar evento de día completo.
     */
    const isAllDay =
      /DTSTART;[^:\r\n]*VALUE=DATE/i
        .test(block);


    /**
     * --------------------------------------------------------
     * EVENTOS DE DÍA COMPLETO
     * --------------------------------------------------------
     *
     * Ejemplo:
     *
     * DTSTART;VALUE=DATE:20260920
     * DTEND;VALUE=DATE:20260921
     *
     * DTEND es exclusivo.
     */
    if (
      isAllDay &&
      endDate
    ) {

      let current =
        startDate;


      while (
        current < endDate
      ) {

        occupiedDates.add(
          current
        );


        current =
          addDays(
            current,
            1
          );

      }

    }


    /**
     * --------------------------------------------------------
     * EVENTOS CON HORARIO
     * --------------------------------------------------------
     *
     * Ejemplo:
     *
     * 16 Sep
     * 20:00 - 23:30
     *
     * Marcamos el día como ocupado.
     */
    else {

      occupiedDates.add(
        startDate
      );

    }

  }


  /**
   * Convertir las fechas a formato
   * esperado por la página.
   */
  return Array
    .from(occupiedDates)
    .sort()
    .map(
      date => ({
        date,
        title:
          "Fecha ocupada",

        category:
          "Evento agendado"
      })
    );
}


/**
 * ============================================================
 * CLOUDFLARE PAGES FUNCTION
 * ============================================================
 *
 * Endpoint:
 *
 * /api/events
 */
export async function onRequest({
  request,
  env
}) {

  /**
   * Solo permitimos GET.
   */
  if (
    request.method !== "GET"
  ) {

    return json(
      {
        error:
          "Método no permitido."
      },
      405
    );

  }


  /**
   * Leer URL secreta
   * configurada en Cloudflare.
   */
  const calendarUrl =
    String(
      env
        .GOOGLE_CALENDAR_ICS_URL ||
      ""
    ).trim();


  /**
   * Si falta la variable.
   */
  if (!calendarUrl) {

    return json({
      events:
        FALLBACK_EVENTS,

      source:
        "fallback",

      configured:
        false,

      diagnostic: {
        stage:
          "missing-variable",

        message:
          "GOOGLE_CALENDAR_ICS_URL no está configurada."
      }
    });

  }


  try {

    /**
     * ========================================================
     * CONSULTAR GOOGLE CALENDAR
     * ========================================================
     */
    const response =
      await fetch(
        calendarUrl,
        {
          redirect:
            "follow",

          headers: {
            "Accept":
              "text/calendar,text/plain,*/*"
          }
        }
      );


    const contentType =
      response
        .headers
        .get(
          "content-type"
        ) ||
      "desconocido";


    /**
     * Google respondió,
     * pero con error HTTP.
     */
    if (!response.ok) {

      return json({
        events:
          FALLBACK_EVENTS,

        source:
          "fallback",

        configured:
          true,

        diagnostic: {
          stage:
            "google-response",

          status:
            response.status,

          statusText:
            response.statusText ||
            "",

          contentType
        }
      });

    }


    /**
     * Leer el contenido ICS.
     */
    const ics =
      await response.text();


    /**
     * Confirmar que realmente
     * sea un calendario.
     */
    const looksLikeCalendar =
      ics
        .trimStart()
        .startsWith(
          "BEGIN:VCALENDAR"
        );


    if (
      !looksLikeCalendar
    ) {

      return json({
        events:
          FALLBACK_EVENTS,

        source:
          "fallback",

        configured:
          true,

        diagnostic: {
          stage:
            "invalid-content",

          status:
            response.status,

          contentType,

          bodyLength:
            ics.length,

          message:
            "La URL respondió, pero no entregó un archivo iCalendar válido."
        }
      });

    }


    /**
     * Interpretar eventos.
     */
    const googleEvents =
      parseCalendar(ics);


    /**
     * ========================================================
     * RESPUESTA EXITOSA
     * ========================================================
     */
    return json({

      events:
        googleEvents,

      source:
        "google-calendar",

      configured:
        true,

      count:
        googleEvents.length,

      timezone:
        "America/Mexico_City",

      diagnostic: {
        stage:
          "success",

        status:
          response.status,

        contentType
      }

    });

  }


  catch (error) {

    /**
     * Error de red,
     * ejecución o fetch.
     */
    return json({

      events:
        FALLBACK_EVENTS,

      source:
        "fallback",

      configured:
        true,

      diagnostic: {
        stage:
          "fetch-error",

        message:
          String(
            error?.message ||
            error
          )
      }

    });

  }
}
