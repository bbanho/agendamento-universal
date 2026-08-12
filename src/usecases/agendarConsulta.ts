// UC-02 — AgendarConsulta
// Pipeline: paciente existe? → slot livre? → lock otimista? → salvar compromisso → evento
// R2 ("retorno prioriza") é aplicado no UC-01 (consulta de disponibilidade) e no ERP;
// NÃO se resolve no agendamento porque aqui o slot já é exclusivo antes do commit.

import type { Appointment, DomainEvent, Result } from '../domain/model.ts'
import type { AgendaPort, EventStorePort, PatientPort } from '../ports/ports.ts'

export interface AgendarInput {
  patientId: string
  slotId: string
}

export interface AgendarOutput {
  appointment: Appointment
  event: DomainEvent
}

export async function agendarConsulta(
  agenda: AgendaPort,
  patients: PatientPort,
  events: EventStorePort,
  input: AgendarInput,
): Promise<Result<AgendarOutput>> {
  const patient = await patients.getPatient(input.patientId)
  if (!patient) {
    return { ok: false, conflict: { reason: 'Paciente não encontrado' } }
  }

  const slot = await agenda.getSlot(input.slotId)
  if (!slot || slot.status !== 'free') {
    return { ok: false, conflict: { reason: 'Slot indisponível' } }
  }

  // lock otimista (D4): se outra requisição ganhou a corrida, bookSlot devolve null
  const booked = await agenda.bookSlot(slot.id, slot.version)
  if (!booked) {
    return { ok: false, conflict: { reason: 'Conflito de concorrência: tente novamente' } }
  }

  const appointment: Appointment = {
    id: `appt_${crypto.randomUUID().slice(0, 8)}`,
    patientId: input.patientId,
    slotId: booked.id,
    practitionerId: booked.practitionerId,
    kind: patient.isFollowUp ? 'followUp' : 'first',
    start: booked.start,
    status: 'scheduled',
  }

  await agenda.saveAppointment(appointment)

  const event: DomainEvent = {
    kind: 'appointment.created',
    appointmentId: appointment.id,
    payload: { patientId: appointment.patientId, slotId: appointment.slotId, start: appointment.start },
    idempotencyKey: `created-${appointment.id}`,
  }
  const appended = await events.tryAppend(event) // D7
  if (!appended) {
    return { ok: false, conflict: { reason: 'Evento duplicado' } }
  }

  return { ok: true, value: { appointment, event } }
}
