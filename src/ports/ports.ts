// Portas (interfaces) — o domínio depende destas abstrações, nunca de infra.

import type { Appointment, DomainEvent, Patient, Practitioner, Slot } from '../domain/model.ts'

export interface AgendaPort {
  listFreeSlots(scheduleId: string, from: string, to: string): Promise<Slot[]>
  getSlot(slotId: string): Promise<Slot | null>
  /** lock otimista: falha (volta null) se version não bate — D4 */
  bookSlot(slotId: string, expectedVersion: number): Promise<Slot | null>
  releaseSlot(slotId: string): Promise<void>
  saveAppointment(appt: Appointment): Promise<void>
  getAppointment(apptId: string): Promise<Appointment | null>
}

export interface PatientPort {
  getPatient(patientId: string): Promise<Patient | null>
}

export interface NotifyPort {
  send(channel: string, to: string, message: string): Promise<void>
}

export interface EventStorePort {
  /** D7 — idempotência: devolve false se a chave já foi processada */
  tryAppend(event: DomainEvent): Promise<boolean>
  /** R5 — devolve apenas eventos ainda não entregues ao ERP */
  pending(): Promise<DomainEvent[]>
  markSent(key: string): Promise<void>
}

export interface ErpAdapterPort {
  /** full duplex — importa catálogo (serviços/pacientes) para a agenda */
  importCatalog(): Promise<{ practitioners: Practitioner[]; patients: Patient[] }>
  /** full duplex — exporta eventos de compromisso para o ERP (webhook) */
  syncEvents(events: DomainEvent[]): Promise<void>
}