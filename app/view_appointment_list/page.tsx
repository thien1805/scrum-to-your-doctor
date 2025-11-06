"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/client";
import { Menu, Clock, Calendar } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardAction,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PatientInfo = {
  patient_id: string;
  full_name: string;
  gender: string | null;
  dob: string | null;
  phone: string | null;
  citizen_id: string | null;
};

type AppointmentType = {
  appointment_id: string;
  doctor_id: string;
  specialty_id: number;
  symptom: string;
  appointment_date: string;
  appointment_time: string;
  status: string;
  note: string | null;
  doctor: {
    doctor_id: string;
    doctor_name: string;
    specialty_id: number;
    specialty_name: string | null;
  } | null;
};

const fromDbGender = (v?: string | null): string => {
  if (!v) return "";
  switch (String(v).toLowerCase()) {
    case "male":
      return "Male";
    case "female":
      return "Female";
    case "other":
      return "Other";
    default:
      return String(v);
  }
};

export default function ViewAppointmentListPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [patientInfo, setPatientInfo] = useState<PatientInfo | null>(null);
  const [appointments, setAppointments] = useState<AppointmentType[]>([]);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchPatientInfo = async () => {
    try {
      const supabase = createClient();
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) {
        router.push("/auth/login");
        return;
      }
      const { data, error } = await supabase
        .from("patients")
        .select("patient_id, full_name, gender, dob, phone, citizen_id")
        .eq("id", user.id)
        .maybeSingle();
      if (error) {
        toast.error([error.message, error.details, error.hint].filter(Boolean).join(" — ") || "Could not load patient info");
        return;
      }
      if (data) {
        setPatientInfo({
          patient_id: data.patient_id ?? "",
          full_name: data.full_name ?? "",
          gender: data.gender ?? null,
          dob: data.dob ?? null,
          phone: data.phone ?? null,
          citizen_id: data.citizen_id ?? null,
        });
      } else {
        setPatientInfo(null);
      }
    } catch (e) {
      console.error(e);
      toast.error("An error occurred while loading patient info.");
    }
  };

  const fetchAppointments = async () => {
    try {
      setLoading(true);
      const supabase = createClient();
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) {
        router.push("/auth/login");
        return;
      }

      let query = supabase
        .from("appointment")
        .select("appointment_id, doctor_id, schedule_id, date, time, status, symptom, note")
        .eq("patient_id", user.id);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const asc = sortOrder === "asc";
      query = query.order("date", { ascending: asc }).order("time", { ascending: asc });

      const { data: appts, error } = await query;
      if (error) {
        toast.error([error.message, error.details, error.hint].filter(Boolean).join(" — ") || "Could not load appointments");
        setAppointments([]);
        return;
      }

      const appointmentsRaw = appts || [];
      const doctorIds = Array.from(new Set(appointmentsRaw.map((a: any) => a.doctor_id))).filter(Boolean);

      // Tải thông tin bác sĩ theo danh sách doctor_id
      let doctorsMap = new Map<string, { doctor_id: string; doctor_name: string; specialty_id: number }>();
      if (doctorIds.length) {
        const { data: docs, error: docsErr } = await supabase
          .from("doctors")
          .select("doctor_id, doctor_name, specialty_id")
          .in("doctor_id", doctorIds);
        if (!docsErr && Array.isArray(docs)) {
          docs.forEach((d) => doctorsMap.set(d.doctor_id, { doctor_id: d.doctor_id, doctor_name: d.doctor_name, specialty_id: d.specialty_id }));
        }
      }

      // Tải tên chuyên khoa theo specialty_id
      const specialtyIds = Array.from(new Set(Array.from(doctorsMap.values()).map((d) => d.specialty_id))).filter((x) => typeof x === "number");
      let specialtyNameMap = new Map<number, string>();
      if (specialtyIds.length) {
        const { data: specs, error: specErr } = await supabase
          .from("specialty")
          .select("specialty_id, specialty_name")
          .in("specialty_id", specialtyIds as number[]);
        if (!specErr && Array.isArray(specs)) {
          specs.forEach((s) => specialtyNameMap.set(s.specialty_id, s.specialty_name));
        }
      }

      const enriched = appointmentsRaw.map((a: any) => {
        const doc = doctorsMap.get(a.doctor_id);
        const specialtyName = doc ? specialtyNameMap.get(doc.specialty_id) ?? null : null;
        return {
          appointment_id: String(a.appointment_id ?? ""),
          doctor_id: a.doctor_id,
          specialty_id: doc ? doc.specialty_id : 0,
          symptom: a.symptom ?? "",
          appointment_date: a.date,
          appointment_time: a.time,
          status: a.status ?? "",
          note: a.note ?? null,
          doctor: doc
            ? {
                doctor_id: doc.doctor_id,
                doctor_name: doc.doctor_name,
                specialty_id: doc.specialty_id,
                specialty_name: specialtyName,
              }
            : null,
        } as AppointmentType;
      });

      setAppointments(enriched);
    } catch (error) {
      toast.error("Could not load appointments");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatientInfo();
    fetchAppointments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortOrder, statusFilter]);

  const formatDateTime = (date: string, time: string) => {
    return new Date(`${date}T${time}`).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation Bar */}
      <nav className="fixed top-0 left-24 right-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center">
          <div className="mr-4 hidden md:flex">
            <Link href="/" className="mr-6 flex items-center space-x-2">
              <span className="font-bold">Scrumies</span>
            </Link>
            <nav className="flex items-center space-x-6 text-sm font-medium">
              <Link href="/" className="transition-colors hover:text-foreground/80">
                Home
              </Link>
              <Link href="/services" className="transition-colors hover:text-foreground/80">
                Services
              </Link>
              <Link href="/contact" className="transition-colors hover:text-foreground/80">
                Contact
              </Link>
            </nav>
          </div>
          <Button
            variant="ghost"
            className="ml-auto h-8 w-8 md:hidden"
            size="icon"
          >
            <Menu className="h-4 w-4" />
          </Button>
        </div>
      </nav>

      <main className="container mx-auto px-4 pt-20">
        {/* Personal Information Card */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardAction>
              <Link href="/booking-appointment">
                <Button>Book Appointment</Button>
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="animate-pulse space-y-4">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              </div>
            ) : patientInfo ? (
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-sm text-muted-foreground">Full Name</p>
                  <p className="font-medium">{patientInfo.full_name || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Gender</p>
                  <p className="font-medium">{fromDbGender(patientInfo.gender) || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date of Birth</p>
                  <p className="font-medium">{patientInfo.dob || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="font-medium">{patientInfo.phone || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Citizen ID</p>
                  <p className="font-medium">{patientInfo.citizen_id || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Patient ID</p>
                  <p className="font-medium">{patientInfo.patient_id || "—"}</p>
                </div>
              </div>
            ) : (
              <p>No patient information available</p>
            )}
          </CardContent>
        </Card>

        {/* Appointment History Section */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Appointment History</h2>
          <div className="flex gap-4">
            <Select value={sortOrder} onValueChange={(value: "asc" | "desc") => setSortOrder(value)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Newest First</SelectItem>
                <SelectItem value="asc">Oldest First</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Filter by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="upcoming">Upcoming</SelectItem>
                <SelectItem value="ongoing">Ongoing</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Appointment Cards */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((n) => (
              <Card key={n} className="animate-pulse">
                <CardContent className="py-8">
                  <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : appointments.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">You don't have any appointments yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {appointments.map((appointment) => (
              <Card key={appointment.appointment_id}>
                <CardHeader>
                  <CardTitle>{appointment.doctor?.doctor_name || "Unknown Doctor"}</CardTitle>
                  <CardAction>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium ${
                      appointment.status === "upcoming" ? "bg-blue-100 text-blue-800" :
                      appointment.status === "completed" ? "bg-green-100 text-green-800" :
                      appointment.status === "cancelled" ? "bg-red-100 text-red-800" :
                      "bg-gray-100 text-gray-800"
                    }`}>
                      {appointment.status}
                    </span>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>{appointment.doctor?.specialty_name || "Unknown Specialty"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>{formatDateTime(appointment.appointment_date, appointment.appointment_time)}</span>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Symptoms</p>
                      <p>{appointment.symptom || "No symptoms listed"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}