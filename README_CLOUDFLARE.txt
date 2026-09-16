GRUPO IMPERIO M&A EVENTOS — GOOGLE CALENDAR + CLOUDFLARE PAGES

OBJETIVO
Alondra NO necesita entrar a Cloudflare ni editar la página.
Ella administra todo desde la app normal de Google Calendar de su teléfono.
El sitio web consulta esa agenda automáticamente y únicamente publica si una fecha está ocupada.

PASO 1 — CREAR EL CALENDARIO DE ALONDRA
1. Desde Google Calendar en una computadora, crear un calendario nuevo llamado:
   Grupo Imperio M&A Eventos
2. Agregar ahí las reservaciones reales.
3. Cargar también las dos fechas iniciales:
   - 20/09/2026 — Cumpleaños Sebastián
   - 26/09/2026 — Cumpleaños Jesusa
4. Alondra puede escribir dentro del evento todos los datos privados que necesite:
   cliente, teléfono, lugar, anticipo, horario, notas, etc.
   Esos datos NO se muestran en la página web.

PASO 2 — OBTENER LA DIRECCIÓN PRIVADA ICAL
1. Google Calendar > Configuración.
2. Seleccionar "Grupo Imperio M&A Eventos".
3. Abrir "Integrar calendario".
4. Copiar "Dirección secreta en formato iCal".
IMPORTANTE: esta dirección es privada. No debe compartirse ni colocarse dentro del index.html.

PASO 3 — CONFIGURAR CLOUDFLARE PAGES UNA SOLA VEZ
1. Publicar esta carpeta completa en Cloudflare Pages.
2. En Settings > Variables and Secrets crear un secreto llamado EXACTAMENTE:
   GOOGLE_CALENDAR_ICS_URL
3. Pegar como valor la dirección secreta iCal copiada de Google Calendar.
4. Guardar y volver a desplegar el proyecto.

A PARTIR DE AQUÍ, ALONDRA SOLO HACE ESTO
1. Abre Google Calendar en su celular.
2. Pulsa + > Evento.
3. Escribe el nombre del evento.
4. Elige fecha y horario.
5. Guarda.
La página web mostrará esa fecha como OCUPADA automáticamente.

PARA CAMBIAR O CANCELAR
- Si Alondra cambia la fecha del evento en Google Calendar, la web reflejará la nueva fecha.
- Si elimina o cancela el evento, la fecha dejará de mostrarse ocupada después de la siguiente sincronización.
- La API usa una caché corta de aproximadamente 60 segundos para evitar consultas excesivas.

PRIVACIDAD
La función de Cloudflare descarga el calendario del lado del servidor y devuelve al navegador solamente:
- fecha ocupada
- estado genérico "Evento agendado"
Nunca devuelve el nombre del cliente, teléfono, ubicación, notas, anticipo ni descripción del evento.

LIMITACIONES RECOMENDADAS
- Para reservaciones, crear eventos normales de una sola fecha o rango de fechas.
- Evitar usar eventos repetitivos/recurrencias para las reservaciones.
- Si un evento dura varios días, el sitio marcará el rango como ocupado (máximo 31 días por evento).

MODO DE RESPALDO
Si todavía no se configura GOOGLE_CALENDAR_ICS_URL o Google Calendar no responde, la página conserva temporalmente estas dos fechas como ocupadas:
- 20/09/2026
- 26/09/2026

VALIDACIONES DEL PROYECTO
- Galería y filtros por categoría.
- Lightbox de fotografías.
- Menú de escritorio y móvil.
- Calendario mensual y navegación por meses.
- Consulta de disponibilidad desde el formulario.
- Formulario de WhatsApp.
- Agenda pública sin datos privados.
- Sin panel técnico de administración para Alondra.
