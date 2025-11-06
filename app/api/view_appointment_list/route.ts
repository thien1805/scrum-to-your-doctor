import { NextResponse } from "next/server"
import { createClient } from "@/lib/server"


export async function GET(req: Request) {
    try {
        const supabase = await createClient();

        //Auth
        const {
            data: { user },
            error: authErr,
        } = await supabase.auth.getUser();
        if (authErr || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // find patient record linked to auth user
        const { data: patient, error: patientErr } = await supabase
            .from("patients")
            .select("patient_id, full_name, gender, dob, phone, citizen_id")
            .eq("id", user.id)
            .single();

    if (patientErr){
    // If no patient record exists, still return 200 with empty appointments per acceptance criteria
        return NextResponse.json({patient:null, appointments: [] });
    }

    //Parse query params
    const url = new URL(req.url);
    const status = url.searchParams.get("status"); // optional filter by status
    const sort = url.searchParams.get("sort")?.toLowerCase() === "asc" ? "asc" : "desc"; // default to desc

    //Load appointments for this patient
    let query = supabase
        .from("appointment")
        .select("appointment_id, doctor_id, specialty_id,symptom, appointment_date, appointment_time, status, note")
       .eq("patient_id", patient.patient_id);

    if (status) {
        query = query.eq("status", status);
    }

    query = query.order("appointment_date", { ascending: sort === "asc" });
    query = query.order("appointment_start", { ascending: sort === "asc" });
    
    const { data: appointments, error: appErr } = await query;
    if (appErr) {
        return NextResponse.json({ error: "Failed to load appointments" }, { status: 500 });
    }

    if (!appointments || appointments.length === 0) {
        return NextResponse.json({patient, appointments: [] });
    }

    // Load doctors referenced by the appointments
    const doctorIds = Array.from(new Set(appointments.map((a: any) => a.doctor_id).filter(Boolean)));
    const { data: doctors, error: docErr } = await supabase
        .from("doctor")
        .select("doctor_id, full_name, specialty_id")
        .in("doctor_id", doctorIds);
    
    if (docErr) {
        return NextResponse.json({ error: "Failed to load doctors" }, { status: 500 });
    }

    //Load specialtíe referenced by doctors
    const specialtyIds = Array.from(new Set(doctors.map((d: any) => d.specialty_id).filter(Boolean)));
    const { data: specialties, error: specErr } = await supabase
        .from("specialty")
        .select("specialty_id, specialty_name")
        .in("specialty_id", specialtyIds);

    if (specErr) {
        return NextResponse.json({ error: "Failed to load specialties" }, { status: 500 });
    }

    const doctorMap = new Map<number, any>();
    doctors.forEach((d: any) => doctorMap.set(d.doctor_id, d));
    const specialtyMap = new Map<number, any>();
    specialties.forEach((s: any) => specialtyMap.set(s.specialty_id, s));

    //Compose final appointment list with doctor & specialty info
    const mapped = appointments.map((a: any) => {
        const doc = doctorMap.get(a.doctor_id) || null;
        const spec = doc ? specialtyMap.get(doc.specialty_id) || null : null;
        return {
            appointment_id: a.appointment_id,
            schedule_id: a.schedule_id,
            date: a.date,
            time: a.time,
            status: a.status,
            symptom: a.symptom,
            note: a.note ?? null,
            doctor: doc
            ? {
                doctor_id: doc.doctor_id,
                full_name: doc.full_name,
                specialty_id: doc.specialty_id,
                specialty_name: spec ? spec.specialty_name : null,
            }
        : null,
        };
    });
    return NextResponse.json({ patient, appointments: mapped });
} catch (err) {
    return NextResponse.json(({ error: "Server error" }), { status: 500 });
}
}
