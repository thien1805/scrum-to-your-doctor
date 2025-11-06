export type PatientInfo = {
  patient_id: string
  full_name: string
  gender: string
  dob: string
  phone: string
  citizen_id: string
}

export type AppointmentType = {
  appointment_id: number
  appointment_date: string
  appointment_start: string
  status: string
  note: string | null
  doctor: {
    doctor_id: number
    full_name: string
    specialty_id: number
    specialty_name: string | null
  } | null
}