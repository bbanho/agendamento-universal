// Domínio puro — entidades (FHIR-inspired simplificado)
// Zero dependências externas. Regra de pureza: nada de infra aqui.

export type ID = string
export type TimePoint = string // ISO 8601 (ex.: "2026-08-12T10:00:00")

export interface Patient { id: ID; name: string; isFollowUp: boolean }
export interface Practitioner { id: ID; name: string }
export interface Schedule { id: ID; practitionerId: ID }

export type SlotStatus = 'free' | 'held' | 'booked'

export interface Slot {
  id: ID
  scheduleId: ID
  practitionerId: ID
  start: TimePoint
  /** duração em minutos */
  durationMin: number
  status: SlotStatus
  /** versão p/ lock otimista (D4) */
  version: number
}

export type AppointmentKind = 'first' | 'followUp'

export interface Appointment {
  id: ID
  patientId: ID
  slotId: ID
  practitionerId: ID
  kind: AppointmentKind
  start: TimePoint
  status: 'scheduled' | 'cancelled'
}

export interface DomainEvent {
  kind: 'appointment.created' | 'appointment.removed'
  appointmentId: ID
  payload: Record<string, unknown>
  idempotencyKey: string // D7 — reenvio não duplica
}

export interface Conflict {
  reason: string
}

export type Result<T> = { ok: true; value: T } | { ok: false; conflict: Conflict }