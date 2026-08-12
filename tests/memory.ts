// In-memory adapters de teste (hexagonal: o domínio não sabe que é memória)

import type { Appointment, DomainEvent, Patient, Practitioner, Slot } from '../src/domain/model.ts'
import type { AgendaPort, ErpAdapterPort, EventStorePort, NotifyPort, PatientPort } from '../src/ports/ports.ts'

export class MemoryAgenda implements AgendaPort {
  slots = new Map<string, Slot>()
  appointments = new Map<string, Appointment>()

  async listFreeSlots(scheduleId: string, from: string, to: string) {
    return [...this.slots.values()].filter((s) => s.scheduleId === scheduleId && s.status === 'free' && s.start >= from && s.start <= to)
  }
  async getSlot(slotId: string) {
    return this.slots.get(slotId) ?? null
  }
  async bookSlot(slotId: string, expectedVersion: number) {
    const s = this.slots.get(slotId)
    if (!s || s.status !== 'free' || s.version !== expectedVersion) return null // lock otimista (D4)
    const booked = { ...s, status: 'booked' as const, version: s.version + 1 }
    this.slots.set(slotId, booked)
    return booked
  }
  async releaseSlot(slotId: string) {
    const s = this.slots.get(slotId)
    if (s) this.slots.set(slotId, { ...s, status: 'free', version: s.version + 1 })
  }
  async saveAppointment(appt: Appointment) {
    this.appointments.set(appt.id, appt)
  }
  async getAppointment(apptId: string) {
    return this.appointments.get(apptId) ?? null
  }
}

export class MemoryPatients implements PatientPort {
  constructor(private patients: Patient[]) {}
  async getPatient(patientId: string) {
    return this.patients.find((p) => p.id === patientId) ?? null
  }
}

export class MemoryEvents implements EventStorePort {
  sent = new Set<string>()
  constructor(private store = new Map<string, DomainEvent>()) {}
  async tryAppend(event: DomainEvent) {
    if (this.store.has(event.idempotencyKey)) return false // D7 — idempotência
    this.store.set(event.idempotencyKey, event)
    return true
  }
  async pending() {
    // fila entrega cada evento UMA única vez (R5): não-enviados apenas
    return [...this.store.values()].filter((ev) => !this.sent.has(ev.idempotencyKey))
  }
  async markSent(key: string) {
    this.sent.add(key)
  }
}

export class MemoryNotify implements NotifyPort {
  calls: string[] = []
  async send(channel: string, to: string, message: string) {
    this.calls.push(`${channel}:${to}:${message}`)
  }
}

export class MemoryErp implements ErpAdapterPort {
  /** dedup por idempotencyKey (R5 — o receptor ignora chaves repetidas) */
  seenKeys = new Set<string>()
  processed = 0
  imported = false
  constructor(private practitioners: Practitioner[] = [], private patients: Patient[] = []) {}
  async importCatalog() {
    this.imported = true
    return { practitioners: this.practitioners, patients: this.patients }
  }
  async syncEvents(events: DomainEvent[]) {
    for (const ev of events) {
      if (this.seenKeys.has(ev.idempotencyKey)) continue
      this.seenKeys.add(ev.idempotencyKey)
      this.processed++
    }
  }
}