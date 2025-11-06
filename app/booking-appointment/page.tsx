"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/client";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
// Calendar/Popover removed: using dropdown for work_date
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type SpecialtyOption = { specialty_id: number; specialty_name: string };
type DoctorOption = { doctor_id: string; doctor_name: string; specialty_id: number };
type ScheduleOption = {
  schedule_id: number;
  doctor_id: string;
  work_date: string; // yyyy-mm-dd
  start_time: string; // HH:mm:ss
  end_time: string; // HH:mm:ss
  is_available: boolean;
};

export default function BookingAppointmentPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [patientId, setPatientId] = useState<string>("");
  const [patientName, setPatientName] = useState<string>("");

  const [specialties, setSpecialties] = useState<SpecialtyOption[]>([]);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [schedules, setSchedules] = useState<ScheduleOption[]>([]);

  const [selectedSpecialtyId, setSelectedSpecialtyId] = useState<number | "">("");
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | "">("");
  const [appointmentDate, setAppointmentDate] = useState<string>("");
  const [appointmentStart, setAppointmentStart] = useState<string>("");
  const [appointmentEnd, setAppointmentEnd] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [symptoms, setSymptoms] = useState<string>("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [timeSlots, setTimeSlots] = useState<Array<{ start: string; end: string }>>([]);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<number[]>([]);

  useEffect(() => {
    const init = async () => {
      const supabase = createClient();
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) {
        router.push("/auth/login");
        return;
      }

      setUserId(user.id);

      // Lấy patient_id và tên bệnh nhân từ bảng patients (id = auth.user_id)
      const { data: patient, error: patErr } = await supabase
        .from("patients")
        .select("patient_id, full_name")
        .eq("id", user.id)
        .maybeSingle();

      if (patErr) {
        console.warn("Could not load patient profile:", patErr);
      }

      if (patient?.patient_id) {
        setPatientId(patient.patient_id);
      }
      if (patient?.full_name) {
        setPatientName(String(patient.full_name));
      }

      // Nạp danh sách chuyên khoa
      const { data: specs } = await supabase
        .from("specialty")
        .select("specialty_id, specialty_name")
        .order("specialty_name", { ascending: true });

      setSpecialties(specs || []);

      // Nạp danh sách bác sĩ (kèm specialty_id)
      const { data: docs, error: docsErr } = await supabase
        .from("doctors")
        .select("doctor_id, doctor_name, specialty_id")
        .order("doctor_name", { ascending: true });

      if (docsErr) {
        console.error("Failed to load doctors:", docsErr);
        toast.error("Không thể tải danh sách bác sĩ. Vui lòng kiểm tra quyền truy cập hoặc RLS.");
      }

      setDoctors(docs || []);
      setLoading(false);
    };
    init();
  }, [router]);

  // Khi chọn doctor, nạp schedules khả dụng của doctor đó
  useEffect(() => {
    const fetchSchedules = async () => {
      if (!selectedDoctorId) {
        setSchedules([]);
        return;
      }
      const supabase = createClient();
      const { data: sch, error: schErr } = await supabase
        .from("doctor_schedule")
        .select("schedule_id, doctor_id, work_date, start_time, end_time, is_available")
        .eq("doctor_id", selectedDoctorId)
        .eq("is_available", true)
        .order("work_date", { ascending: true });
      if (schErr) {
        console.error("Failed to load schedules:", schErr);
        toast.error("Không thể tải lịch làm việc của bác sĩ.");
      }
      setSchedules(sch || []);
    };
    fetchSchedules();
  }, [selectedDoctorId]);

  // Xác định schedule theo ngày hẹn đã chọn
  const selectedSchedule = useMemo(
    () => schedules.find((s) => s.work_date === appointmentDate),
    [schedules, appointmentDate]
  );

  // Danh sách ngày làm việc của bác sĩ (unique, sorted)
  const availableDates = useMemo(() => {
    const set = new Set<string>();
    schedules.forEach((s) => set.add(s.work_date));
    return Array.from(set).sort();
  }, [schedules]);

  // Lọc lịch theo ngày hẹn nếu đã chọn ngày
  // Bỏ lọc và chọn schedule bằng ngày hẹn, không còn dropdown schedule

  // Map chuyên khoa để hiển thị tên từ id
  const specialtyNameById = useMemo(() => {
    const map = new Map<number, string>();
    specialties.forEach((s) => map.set(s.specialty_id, s.specialty_name));
    return map;
  }, [specialties]);

  // Lọc bác sĩ theo chuyên khoa nếu đã chọn chuyên khoa
  const filteredDoctors = useMemo(() => {
    if (!selectedSpecialtyId) return doctors;
    return doctors.filter((d) => d.specialty_id === selectedSpecialtyId);
  }, [doctors, selectedSpecialtyId]);

  // Gọi AI recommend chuyên khoa dựa trên triệu chứng
  const askAIForSpecialty = async () => {
    const text = symptoms.trim();
    if (!text) {
      toast.info("Please describe your symptoms first.");
      return;
    }
    try {
      setAiLoading(true);
      setAiSuggestions([]);
      const resp = await fetch("/api/ai/specialty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symptoms: text }),
      });
      if (!resp.ok) {
        const detail = await resp.json().catch(() => ({}));
        toast.error("AI could not suggest a specialty.");
        console.error("AI error:", detail);
        return;
      }
      const { specialty_ids } = await resp.json();
      setAiSuggestions(specialty_ids || []);
      if (Array.isArray(specialty_ids) && specialty_ids.length) {
        // Tự động chọn chuyên khoa đầu tiên gợi ý để lọc bác sĩ
        setSelectedSpecialtyId(specialty_ids[0]);
      }
      toast.success("Suggested suitable specialties.");
    } catch (e) {
      toast.error("An error occurred when calling AI.");
      console.error(e);
    } finally {
      setAiLoading(false);
    }
  };

  // Sinh khung giờ 30 phút từ schedule theo ngày đã chọn
  useEffect(() => {
    if (!selectedSchedule) {
      setTimeSlots([]);
      setSelectedSlotIndex(null);
      return;
    }
    const toSec = (t: string) => {
      const [hh, mm, ss] = t.split(":");
      return Number(hh) * 3600 + Number(mm) * 60 + Number(ss || 0);
    };
    const toHHMM = (sec: number) => {
      const hh = Math.floor(sec / 3600).toString().padStart(2, "0");
      const mm = Math.floor((sec % 3600) / 60).toString().padStart(2, "0");
      return `${hh}:${mm}`;
    };

    const startBound = toSec(selectedSchedule.start_time);
    const endBound = toSec(selectedSchedule.end_time);
    // Khung giờ nghỉ trưa: 11:00 đến 13:00
    const lunchStart = toSec("11:00:00");
    const lunchEnd = toSec("13:00:00");
    const interval = 30 * 60; // 30 phút
    const slots: Array<{ start: string; end: string }> = [];
    for (let start = startBound; start + interval <= endBound; start += interval) {
      const end = start + interval;
      // Bỏ các slot trùng với giờ nghỉ trưa
      const overlapsLunch = !(end <= lunchStart || start >= lunchEnd);
      if (overlapsLunch) {
        continue;
      }
      slots.push({ start: toHHMM(start), end: toHHMM(end) });
    }
    setTimeSlots(slots);
    setSelectedSlotIndex(null);
    setAppointmentStart("");
    setAppointmentEnd("");
  }, [selectedSchedule]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!userId) newErrors.patientId = "Missing authenticated patient ID.";
    if (!selectedDoctorId) newErrors.doctorId = "Please select a doctor.";
    if (!selectedSchedule) newErrors.scheduleId = "No available schedule for selected date.";
    if (selectedSlotIndex === null) newErrors.slot = "Please select a 30-minute slot.";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      setLoading(true);
      const supabase = createClient();
      const composedNote = (() => {
        const parts: string[] = [];
        if (symptoms && symptoms.trim().length > 0) parts.push(`Triệu chứng: ${symptoms.trim()}`);
        if (note && note.trim().length > 0) parts.push(note.trim());
        return parts.length ? parts.join("\n") : null;
      })();
      const { data, error } = await supabase
        .from("appointment")
        .insert([
          {
            doctor_id: selectedDoctorId as string, // uuid
            patient_id: userId as string, // uuid (patients.id / auth.user.id)
            schedule_id: Number(selectedSchedule?.schedule_id), // int4
            date: appointmentDate, // yyyy-mm-dd (date)
            time: appointmentStart + (appointmentStart.length === 5 ? ":00" : ""), // HH:mm:ss (time)
            status: "upcoming",
            symptom: symptoms.trim() || null,
            note: composedNote,
          },
        ])
        .select()
        .maybeSingle();

      if (error) {
        const msg = [error.message, error.details, error.hint].filter(Boolean).join(" | ") || "Failed to create appointment.";
        console.error("Error creating appointment:", error);
        toast.error(msg);
        return;
      }

      toast.success("Appointment booked successfully!");
      router.push("/view_appointment_list");
    } catch (err) {
      console.error(err);
      toast.error("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

  if (loading) {
    return (
      <main className="py-8 px-6 max-w-3xl mx-auto">
        <Card>
          <CardContent className="py-24 text-center">Loading...</CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="py-8 px-6 max-w-3xl mx-auto">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Booking Appointment</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-2">
              <Label>Patient</Label>
              <Input value={patientName || "Unknown"} readOnly />
              {errors.patientId && <p className="text-sm text-destructive mt-1">{errors.patientId}</p>}
            </div>

            <div className="grid gap-2">
              <Label>Symptoms</Label>
              <Textarea
                rows={4}
                placeholder="Describe your symptoms (optional)"
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label>Specialty</Label>
              <Select
                value={selectedSpecialtyId === "" ? undefined : String(selectedSpecialtyId)}
                onValueChange={(val) => {
                  const newSpecId = val ? Number(val) : "";
                  setSelectedSpecialtyId(newSpecId);
                  if (newSpecId !== "" && selectedDoctorId !== "") {
                    const currentDoc = doctors.find((d) => d.doctor_id === selectedDoctorId);
                    if (currentDoc && currentDoc.specialty_id !== newSpecId) {
                      setSelectedDoctorId("");
                      setSchedules([]);
                      setAppointmentDate("");
                      setTimeSlots([]);
                      setSelectedSlotIndex(null);
                    }
                  }
                }}
              >
                <SelectTrigger className={cn(inputClass)}>
                  <SelectValue placeholder="-- Select specialty (optional) --" />
                </SelectTrigger>
                <SelectContent>
                  {specialties.map((s) => (
                    <SelectItem key={s.specialty_id} value={String(s.specialty_id)}>
                      {s.specialty_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2 mt-2">
                <Button type="button" variant="secondary" onClick={askAIForSpecialty} disabled={aiLoading}>
                  {aiLoading ? "Asking AI..." : "Ask AI for specialty"}
                </Button>
              </div>
              {!!aiSuggestions.length && (
                <div className="mt-2">
                  <Label>AI suggestions</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {aiSuggestions
                      .map((id) => specialties.find((s) => s.specialty_id === id))
                      .filter(Boolean)
                      .map((spec) => (
                        <Button
                          key={spec!.specialty_id}
                          type="button"
                          variant={selectedSpecialtyId === spec!.specialty_id ? "default" : "outline"}
                          onClick={() => setSelectedSpecialtyId(spec!.specialty_id)}
                        >
                          {spec!.specialty_name}
                        </Button>
                      ))}
                  </div>
                </div>
              )}
            </div>

            <div className="grid gap-2">
              <Label>Doctor</Label>
              <Select
                value={selectedDoctorId === "" ? undefined : String(selectedDoctorId)}
                onValueChange={(val) => {
                  const id = val ? String(val) : "";
                  setSelectedDoctorId(id);
                  const doc = doctors.find((d) => d.doctor_id === id);
                  if (doc) {
                    setSelectedSpecialtyId(doc.specialty_id);
                  }
                }}
              >
                <SelectTrigger className={cn(inputClass)} disabled={filteredDoctors.length === 0}>
                  <SelectValue placeholder="-- Select doctor --" />
                </SelectTrigger>
                <SelectContent>
                  {filteredDoctors.map((d) => (
                    <SelectItem key={d.doctor_id} value={String(d.doctor_id)}>
                      {d.doctor_name} (#{d.doctor_id}) {specialtyNameById.get(d.specialty_id) ? `• ${specialtyNameById.get(d.specialty_id)}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filteredDoctors.length === 0 && (
                <p className="text-sm text-muted-foreground mt-1">Không có bác sĩ khả dụng. Hãy thêm dữ liệu hoặc kiểm tra quyền RLS.</p>
              )}
              {errors.doctorId && <p className="text-sm text-destructive mt-1">{errors.doctorId}</p>}
            </div>

            {/* Bỏ phần chọn Work schedule, dùng ngày hẹn để xác định lịch */}

            <div className="grid gap-2">
              <Label>Appointment Date</Label>
              <Select
                value={appointmentDate || undefined}
                onValueChange={(ymd) => {
                  setAppointmentDate(ymd);
                  setSelectedSlotIndex(null);
                  setTimeSlots([]);
                  setAppointmentStart("");
                  setAppointmentEnd("");
                }}
                disabled={!selectedDoctorId || availableDates.length === 0}
              >
                <SelectTrigger className={cn(inputClass)}>
                  <SelectValue placeholder="-- Select work date --" />
                </SelectTrigger>
                <SelectContent>
                  {availableDates.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedSchedule && (
                <p className="text-sm text-muted-foreground mt-1">
                  Working hours: {selectedSchedule.start_time.slice(0,5)} - {selectedSchedule.end_time.slice(0,5)}
                </p>
              )}
              {errors.scheduleId && <p className="text-sm text-destructive mt-1">{errors.scheduleId}</p>}
            </div>

            <div className="grid gap-2">
              <Label>Available time slots</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {timeSlots.map((slot, idx) => (
                  <Card
                    key={`${slot.start}-${slot.end}-${idx}`}
                    className={cn(
                      "cursor-pointer rounded-xl border transition-colors bg-white",
                      selectedSlotIndex === idx
                        ? "bg-teal-500 text-white ring-2 ring-ring border-teal-600"
                        : "hover:bg-muted"
                    )}
                    onClick={() => {
                      setSelectedSlotIndex(idx);
                      setAppointmentStart(slot.start);
                      setAppointmentEnd(slot.end);
                    }}
                  >
                    <CardContent className="py-3 text-center text-sm font-medium">
                      {slot.start}
                    </CardContent>
                  </Card>
                ))}
              </div>
              {errors.slot && <p className="text-sm text-destructive mt-1">{errors.slot}</p>}
            </div>

            <div className="grid gap-2">
              <Label>Note</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
            </div>

            

            <CardFooter className="gap-2">
              <Button type="submit" disabled={loading}>{loading ? "Creating..." : "Book appointment"}</Button>
              <Button type="button" variant="outline" disabled={loading} onClick={() => {
                setSelectedDoctorId("");
                setAppointmentDate("");
                setAppointmentStart("");
                setAppointmentEnd("");
                setTimeSlots([]);
                setSelectedSlotIndex(null);
                setNote("");
                setSymptoms("");
                setAiSuggestions([]);
                setAiLoading(false);
                setErrors({});
              }}>Reset</Button>
            </CardFooter>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}