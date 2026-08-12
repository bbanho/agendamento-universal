// UC-03 — RemarcarConsulta
// Regra R3: "Remarcação só até 24h antes."

import type { Appointment, Result } from '../domain/model.ts'
import { canReschedule } from '../domain/rules.ts'
import type { AgendaPort, EventStorePort } from '../ports/ports.ts'

export interface RemarcarInput {
  appointmentId: string
  newSlotId: string
  now: string
}

export async function remarcarConsulta(
  agenda: AgendaPort,
  events: EventStorePort,
  input: RemarcarInput,
): Promise<Result<{ appointment: Appointment }>> {
  const appt = await agenda.getAppointment(input.appointmentId)
  if (!appt || appt.status !== 'scheduled') {
    return { ok: false, conflict: { reason: 'Compromisso não encontrado' } }
  }

  // R3 — janela de 24h
  const janela = canReschedule(appt.start, input.now)
  if (!janela.ok) return { ok: false as const, conflict: janela.conflict }

  const newSlot = await agenda.getSlot(input.newSlotId)
  if (!newSlot || newSlot.status !== 'free') {
    return { ok: false, conflict: { reason: 'Novo slot indisponível' } }
  }

  const booked = await agenda.bookSlot(newSlot.id, newSlot.version)
  if (!booked) return { ok: false, conflict: { reason: 'Conflito de concorrência: tente novamente' } }

  const moved: Appointment = { ...appt, slotId: booked.id, start: booked.start }

  // libera o slot antigo imediatamente (R4 também vale para remarcação)
  await agenda.releaseSlot(appt.slotId)
  await agenda.saveAppointment(moved)

  await events.tryAppend({
    kind: 'appointment.moved',
    appointmentId: moved.id,
    payload: { patientId: moved.patientId, fromSlotId: appt.slotId, toSlotId: moved.slotId, start: moved.start },
    idempotencyKey: `moved-${moved.id}`,
  })

  return { ok: true, value: { appointment: moved } }
}
