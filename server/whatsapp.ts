/**
 * Módulo de Notificaciones y Alertas WhatsApp Institucionales para Te Escucho.
 * 
 * Protocolo de Máxima Privacidad:
 * - NUNCA incluye datos personales del estudiante (nombre, DNI, IP, teléfono).
 * - NUNCA incluye el relato textual del menor en el mensaje de WhatsApp.
 * - Solo contiene código anónimo (#ESC-XXXX), prioridad institucional y enlace seguro.
 */

import type { RiskLevel } from '../src/types.ts';

export interface WhatsAppAlertParams {
  recipientPhone: string;
  recipientName: string;
  recipientRoleLabel: string;
  schoolName: string;
  ticketCode: string;
  riskLevel: RiskLevel;
  category: string;
  targetedToLabel?: string;
  appBaseUrl?: string;
  isEscalation?: boolean;
  escalationReason?: string;
}

export function cleanPeruvianPhone(rawPhone: string): string {
  if (!rawPhone) return '';
  // Extraer únicamente dígitos
  let digits = rawPhone.replace(/\D/g, '');
  // Si empieza con 51 y tiene 11 dígitos (51 + 9 dígitos), perfecto
  if (digits.startsWith('51') && digits.length === 11) {
    return digits;
  }
  // Si son 9 dígitos empezando en 9 (formato peruano estándar)
  if (digits.length === 9 && digits.startsWith('9')) {
    return `51${digits}`;
  }
  // Si tiene más o menos, devolver dígitos limpios
  return digits;
}

export function buildWhatsAppMessageText(params: WhatsAppAlertParams): string {
  const baseUrl = (params.appBaseUrl || 'https://te-escucho-2rl4.onrender.com').replace(/\/+$/, '');
  const staffUrl = `${baseUrl}/?openStaff=1&staffCase=${encodeURIComponent(params.ticketCode)}`;
  
  const priorityEmoji =
    params.riskLevel === 'critico' ? '🚨 PRIORIDAD ALTA / CRÍTICA' :
    params.riskLevel === 'medio' ? '⚠️ PRIORIDAD MEDIA' : 'ℹ️ PRIORIDAD REGULAR';

  if (params.isEscalation) {
    return (
      `⚠️ *ALERTA DE DESATENCIÓN · TE ESCUCHO*\n` +
      `🏫 *${params.schoolName}*\n\n` +
      `Estimado(a) *${params.recipientName}* (${params.recipientRoleLabel}):\n` +
      `El caso confidencial *${params.ticketCode}* no ha sido atendido en el plazo establecido de guardia y ha sido escalado a su despacho para intervención inmediata.\n\n` +
      `📌 *Código de caso:* \`${params.ticketCode}\`\n` +
      `🏷️ *Categoría:* ${params.category}\n` +
      `⚖️ *Nivel:* ${priorityEmoji}\n` +
      (params.escalationReason ? `📝 *Motivo:* ${params.escalationReason}\n` : '') +
      `\n🔗 *Ingreso seguro al panel:*\n${staffUrl}\n\n` +
      `_Por favor ingrese con sus credenciales institucionales para supervisar la atención._`
    );
  }

  return (
    `🛡️ *TE ESCUCHO · NOTIFICACIÓN INSTITUCIONAL*\n` +
    `🏫 *${params.schoolName}*\n\n` +
    `Estimado(a) *${params.recipientName}* (${params.recipientRoleLabel}):\n` +
    `Se ha recibido una nueva consulta confidencial dirigida a su atención en la plataforma escolar.\n\n` +
    `📌 *Código de caso:* \`${params.ticketCode}\`\n` +
    `⚖️ *Nivel:* ${priorityEmoji}\n` +
    `🏷️ *Categoría:* ${params.category}\n` +
    (params.targetedToLabel ? `👤 *Dirigido a:* ${params.targetedToLabel}\n` : '') +
    `\n🔗 *Ingreso seguro al panel:*\n${staffUrl}\n\n` +
    `_Por favor ingrese con sus credenciales institucionales para revisar y brindar acompañamiento confidencial._`
  );
}

export function buildWhatsAppClickUrl(phone: string, text: string): string {
  const cleanPhone = cleanPeruvianPhone(phone);
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
}

export async function dispatchWhatsAppAlertAsync(
  params: WhatsAppAlertParams
): Promise<{ ok: boolean; waUrl: string; cleanPhone: string; providerSent: boolean; error?: string }> {
  const cleanPhone = cleanPeruvianPhone(params.recipientPhone);
  const text = buildWhatsAppMessageText(params);
  const waUrl = buildWhatsAppClickUrl(cleanPhone, text);

  if (!cleanPhone || cleanPhone.length < 9) {
    return { ok: false, waUrl, cleanPhone, providerSent: false, error: 'Número de WhatsApp inválido o no registrado.' };
  }

  let providerSent = false;
  const webhookUrl = process.env.WHATSAPP_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: cleanPhone,
          message: text,
          ticketCode: params.ticketCode,
          schoolName: params.schoolName,
          riskLevel: params.riskLevel,
        }),
      });
      providerSent = resp.ok;
    } catch {
      providerSent = false;
    }
  }

  return { ok: true, waUrl, cleanPhone, providerSent };
}

