// UC-02 — AgendarConsulta
// Pipeline: validar paciente → checar slot livre → reservar (lock otimista) → persistir → evento
// Regras: R2 (retorno prioriza) e R4 (slot livre é imediatamente agendável).

import type { Appointment, DomainEvent, Result } from '../domain/model.ts'
import { resolvePriority } from '../domain/rules.ts'
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
  if (!patient) return { ok: false, conflict: { reason: 'Paciente não encontrado' } }

  const slot = await agenda.getSlot(input.slotId)
  if (!slot || slot.status !== 'free') {
    return { ok: false, conflict: { reason: 'Slot indisponível' } }
  }

  // reserva com lock otimista (D4): se outra requisição ganhou, falha com retry
  const booked = await agenda.bookSlot(slot.id, slot.version)
  if (!booked) return { ok: false, conflict: { reason: 'Conflito de concorrência: tente novamente' } }

  const appointment: Appointment = {
    id: `appt_${crypto.randomUUID().slice(0, 8)}`,
    patientId: input.patientId,
    slotId: booked.id,
    practitionerId: booked.practitionerId,
    kind: patient.isFollowUp ? 'followUp' : 'first',
    start: booked.start,
    status: 'scheduled',
  }

  // R2 — retorno tem prioridade: se houver disputa pelo mesmo instante, o retorno vence.
  // (Na prática o slot já é exclusivo; aqui garantimos a política de prioridade.)
  const existing = await agenda.getAppointment(booked.id)
  if (existing) {
    const winner = resolvePriority(existing, appointment)
    if (winner.id !== appointment.id) {
      await agenda.releaseSlot(booked.id)
      return { ok: false, conflict: { reason: 'Retorno tem prioridade sobre 1ª consulta (R2)' } }
    }
  }

  await agenda.saveAppointment(appointment)

  const event: DomainEvent = {
    kind: 'appointment.created',
    appointmentId: appointment.id,
    payload: { patientId: appointment.patientId, slotId: appointment.slotId, start: appointment.start },
    idempotencyKey: `created-${appointment.id}`,
  }
  const appended = await events.tryAppend(event) // D7 — idempotência
  if (!appended) return { ok: false, conflict: { reason: 'Evento duplicado' } }

  return { ok: true, value: { appointment, event } }
}