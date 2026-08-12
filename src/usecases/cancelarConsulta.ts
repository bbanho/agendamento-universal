// UC-04 — CancelarConsulta
// Regra R4: "Cancelamento libera o slot imediatamente."

import type { Result } from '../domain/model.ts'
import type { AgendaPort, EventStorePort } from '../ports/ports.ts'

export interface CancelarInput {
  appointmentId: string
  motivo: string
}

export async function cancelarConsulta(
  agenda: AgendaPort,
  events: EventStorePort,
  input: CancelarInput,
): Promise<Result<{ slotLiberado: boolean }>> {
  const appt = await agenda.getAppointment(input.appointmentId)
  if (!appt || appt.status !== 'scheduled') {
    return { ok: false, conflict: { reason: 'Compromisso não encontrado' } }
  }

  const cancelled = { ...appt, status: 'cancelled' as const }
  await agenda.saveAppointment(cancelled)

  // R4 — slot volta a ficar livre no mesmo instante
  await agenda.releaseSlot(appt.slotId)

  await events.tryAppend({
    kind: 'appointment.removed',
    appointmentId: appt.id,
    payload: { motivo: input.motivo, slotId: appt.slotId },
    idempotencyKey: `removed-${appt.id}`,
  })

  return { ok: true, value: { slotLiberado: true } }
}