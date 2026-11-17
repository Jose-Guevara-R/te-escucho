/**
 * Utilidades para cálculo del horario de atención escolar
 * de acuerdo con la propuesta «Alguien se hace cargo».
 */

export interface SchoolOperatingStatus {
  isOpen: boolean;
  supportHoursText: string;
  nextOpenDayLabel: string;
  nextOpenTimeLabel: string;
  fullReturnNotice: string;
}

/**
 * Parsea support_hours como "Lunes a Viernes · 07:00 – 19:00" o "08:00 – 17:00"
 * y evalúa si la hora actual está dentro de la ventana de atención escolar.
 */
export function getSchoolOperatingStatus(
  supportHoursRaw?: string,
  targetDate: Date = new Date()
): SchoolOperatingStatus {
  const defaultText = supportHoursRaw?.trim() || 'Lunes a Viernes · 07:00 – 19:00';

  // Buscar horas en formato HH:MM (ej. 07:00, 7:00, 19:00)
  const timeMatches = defaultText.match(/(\d{1,2}):(\d{2})/g);
  let startHour = 7;
  let startMin = 0;
  let endHour = 19;
  let endMin = 0;

  if (timeMatches && timeMatches.length >= 2) {
    const [h1, m1] = timeMatches[0].split(':').map(Number);
    const [h2, m2] = timeMatches[1].split(':').map(Number);
    if (!Number.isNaN(h1)) startHour = h1;
    if (!Number.isNaN(m1)) startMin = m1;
    if (!Number.isNaN(h2)) endHour = h2;
    if (!Number.isNaN(m2)) endMin = m2;
  }

  const dayOfWeek = targetDate.getDay(); // 0 = Domingo, 6 = Sábado
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  const currentHour = targetDate.getHours();
  const currentMin = targetDate.getMinutes();
  const currentTotalMins = currentHour * 60 + currentMin;
  const startTotalMins = startHour * 60 + startMin;
  const endTotalMins = endHour * 60 + endMin;

  const startTimePadded = `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`;

  const isWeekdayOpen =
    !isWeekend &&
    currentTotalMins >= startTotalMins &&
    currentTotalMins < endTotalMins;

  if (isWeekdayOpen) {
    return {
      isOpen: true,
      supportHoursText: defaultText,
      nextOpenDayLabel: 'hoy',
      nextOpenTimeLabel: startTimePadded,
      fullReturnNotice: `Atención activa hoy hasta las ${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}.`,
    };
  }

  // Determinar cuándo retoma el equipo
  let nextDayLabel = 'mañana';
  if (dayOfWeek === 5 && currentTotalMins >= endTotalMins) {
    // Viernes después de hora de cierre -> vuelve el lunes
    nextDayLabel = 'el lunes';
  } else if (dayOfWeek === 6) {
    // Sábado -> vuelve el lunes
    nextDayLabel = 'el lunes';
  } else if (dayOfWeek === 0) {
    // Domingo -> vuelve el lunes (o mañana)
    nextDayLabel = 'mañana lunes';
  } else if (currentTotalMins < startTotalMins) {
    // Día de semana antes de abrir
    nextDayLabel = 'hoy';
  }

  return {
    isOpen: false,
    supportHoursText: defaultText,
    nextOpenDayLabel: nextDayLabel,
    nextOpenTimeLabel: startTimePadded,
    fullReturnNotice: `Tu mensaje está guardado. El equipo de orientación vuelve ${nextDayLabel} a las ${startTimePadded}. Puedes regresar en cualquier momento con tu código y PIN. Si necesitas ayuda ahora, pulsa SOS para opciones inmediatas.`,
  };
}

