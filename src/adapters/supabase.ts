// Adapter Supabase — persistência real + auth.
// Sem tipos gerados no projeto ainda, então usamos tipagem explícita do client.
// O domínio continua untouched: os UC chamam as portas, não sabem que é Supabase.

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Appointment, DomainEvent, Slot } from '../domain/model.ts'
import type { AgendaPort, EventStorePort } from '../ports/ports.ts'

export interface SupabaseAgendaOptions {
  url: string
  key: string
}

type DbSlot = Pick<Slot, 'id' | 'scheduleId' | 'practitionerId' | 'start' | 'durationMin' | 'status' | 'version'> & {
  schedule_id: string
  practitioner_id: string
  duration_min: number
}

type DbAppointment = {
  id: string
  patient_id: string
  slot_id: string
  practitioner_id: string
  kind: 'first' | 'followUp'
  start: string
  status: 'scheduled' | 'cancelled'
}

type DbEvent = {
  idempotency_key: string
  kind: 'appointment.created' | 'appointment.moved' | 'appointment.removed'
  appointment_id: string
  payload: Record<string, unknown>
  sent: boolean
}

export class SupabaseAgenda implements AgendaPort {
  private client: SupabaseClient<any, any, any>

  constructor(opts: SupabaseAgendaOptions) {
    this.client = createClient(opts.url, opts.key)
  }

  async listFreeSlots(scheduleId: string, from: string, to: string) {
    const { data } = await this.client
      .from('slots')
      .select('*')
      .eq('schedule_id', scheduleId)
      .eq('status', 'free')
      .gte('start', from)
      .lte('start', to)
    return (data as DbSlot[] | null | undefined)?.map((r) => this.rowToSlot(r)) ?? []
  }

  async getSlot(slotId: string) {
    const { data } = await this.client.from('slots').select('*').eq('id', slotId).single()
    return data ? this.rowToSlot(data as DbSlot) : null
  }

  /** D4 — lock otimista via RPC atômico no Postgres */
  async bookSlot(slotId: string, expectedVersion: number) {
    const { data, error } = await this.client.rpc('book_slot', {
      p_slot_id: slotId,
      p_expected_version: expectedVersion,
    })
    if (error || !data) return null
    return this.rowToSlot(data as DbSlot)
  }

  async releaseSlot(slotId: string) {
    const { error } = await this.client.rpc('release_slot', { p_slot_id: slotId })
    if (error) throw new Error(`releaseSlot failed: ${error.message}`)
  }

  async saveAppointment(appt: Appointment) {
    const { error } = await this.client.from('appointments').insert({
      id: appt.id,
      patient_id: appt.patientId,
      slot_id: appt.slotId,
      practitioner_id: appt.practitionerId,
      kind: appt.kind,
      start: appt.start,
      status: appt.status,
    } as DbAppointment)
    if (error) throw new Error(`saveAppointment failed: ${error.message}`)
  }

  async getAppointment(apptId: string) {
    const { data } = await this.client.from('appointments').select('*').eq('id', apptId).single()
    if (!data) return null
    const r = data as DbAppointment
    return {
      id: r.id,
      patientId: r.patient_id,
      slotId: r.slot_id,
      practitionerId: r.practitioner_id,
      kind: r.kind,
      start: r.start,
      status: r.status,
    } as Appointment
  }

  private rowToSlot(r: DbSlot): Slot {
    return {
      id: r.id,
      scheduleId: r.schedule_id,
      practitionerId: r.practitioner_id,
      start: r.start,
      durationMin: r.duration_min,
      status: r.status,
      version: r.version,
    }
  }
}

export class SupabaseEvents implements EventStorePort {
  private client: SupabaseClient<any, any, any>

  constructor(opts: SupabaseAgendaOptions) {
    this.client = createClient(opts.url, opts.key)
  }

  async tryAppend(event: DomainEvent) {
    const { error } = await this.client.from('events').insert({
      idempotency_key: event.idempotencyKey,
      kind: event.kind,
      appointment_id: event.appointmentId,
      payload: event.payload,
      sent: false,
    } as DbEvent)
    return !error
  }

  async pending() {
    const { data } = await this.client.from('events').select('*').eq('sent', false)
    return (data as DbEvent[] | null | undefined)?.map((r) => ({
      kind: r.kind,
      appointmentId: r.appointment_id,
      payload: r.payload,
      idempotencyKey: r.idempotency_key,
    })) as DomainEvent[] ?? []
  }

  async markSent(key: string) {
    const { error } = await this.client.from('events').update({ sent: true }).eq('idempotency_key', key)
    if (error) throw new Error(`markSent failed: ${error.message}`)
  }
}
