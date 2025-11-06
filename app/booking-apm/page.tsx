"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Department = { id: string; name: string };
type Doctor = {
	id: string;
	name: string;
	specialtyId: string;
	availableDays?: number[];
	image?: string;
};

const FALLBACK_DEPARTMENTS: Department[] = [
	{ id: "tm", name: "Cardiology" },
	{ id: "nhi", name: "Pediatrics" },
	{ id: "rhm", name: "Dentistry" },
];

const FALLBACK_DOCTORS: Doctor[] = [
	{ id: "d1", name: "Dr. Alice Morgan", specialtyId: "tm", availableDays: [1, 3, 5] },
	{ id: "d2", name: "Dr. Bob Chen", specialtyId: "tm", availableDays: [0, 2, 4] },
	{ id: "d3", name: "Dr. Carol Singh", specialtyId: "nhi", availableDays: [1, 2, 3, 4, 5] },
	{ id: "d4", name: "Dr. Daniel Park", specialtyId: "rhm", availableDays: [0, 6] },
];

const DEFAULT_TIME_SLOTS = ["08:00", "09:00", "10:00", "14:00", "15:00", "16:00"];

function startOfDay(d: Date) {
	const nd = new Date(d);
	nd.setHours(0, 0, 0, 0);
	return nd;
}
function toISODate(d: Date) {
	return startOfDay(d).toISOString().split("T")[0];
}

export default function BookingPage() {
	const [symptom, setSymptom] = useState("");
	const [symptomError, setSymptomError] = useState<string | null>(null);
	const [departments, setDepartments] = useState<Department[]>([]);
	const [doctors, setDoctors] = useState<Doctor[]>([]);
	const [selectedDept, setSelectedDept] = useState("");
	const [selectedDoctorId, setSelectedDoctorId] = useState("");
	const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined); // store YYYY-MM-DD
	const [bookedSlots, setBookedSlots] = useState<string[]>([]);
	const [selectedTime, setSelectedTime] = useState("");
	const [loading, setLoading] = useState({ deps: false, docs: false, slots: false, submit: false, ai: false });
	const [aiSuggestions, setAiSuggestions] = useState<Department[] | null>(null);

	useEffect(() => {
		let mounted = true;
		(async () => {
			setLoading((s) => ({ ...s, deps: true }));
			try {
				const res = await fetch("/api/departments");
				if (!res.ok) throw new Error("no api");
				const data = (await res.json()) as Department[];
				if (mounted) setDepartments(data || FALLBACK_DEPARTMENTS);
			} catch {
				if (mounted) setDepartments(FALLBACK_DEPARTMENTS);
			} finally {
				if (mounted) setLoading((s) => ({ ...s, deps: false }));
			}
		})();
		return () => {
			mounted = false;
		};
	}, []);

	useEffect(() => {
		let mounted = true;
		setDoctors([]);
		setSelectedDoctorId("");
		setSelectedDate(undefined);
		setSelectedTime("");
		(async () => {
			if (!selectedDept) return;
			setLoading((s) => ({ ...s, docs: true }));
			try {
				const res = await fetch('/api/doctors?department=' + encodeURIComponent(selectedDept));
				if (!res.ok) throw new Error("no api");
				const data = (await res.json()) as Doctor[];
				if (mounted) setDoctors(data || FALLBACK_DOCTORS.filter((d) => d.specialtyId === selectedDept));
			} catch {
				if (mounted) setDoctors(FALLBACK_DOCTORS.filter((d) => d.specialtyId === selectedDept));
			} finally {
				if (mounted) setLoading((s) => ({ ...s, docs: false }));
			}
		})();
		return () => {
			mounted = false;
		};
	}, [selectedDept]);

	useEffect(() => {
		let mounted = true;
		setBookedSlots([]);
		setSelectedTime("");
		(async () => {
			if (!selectedDoctorId || !selectedDate) return;
			setLoading((s) => ({ ...s, slots: true }));
			const dateStr = selectedDate;
			try {
				const res = await fetch(
					`/api/booked-slots?doctorId=${encodeURIComponent(selectedDoctorId)}&date=${encodeURIComponent(dateStr)}`
				);
				if (!res.ok) throw new Error("no api");
				const data = (await res.json()) as string[];
				if (mounted) setBookedSlots(data || []);
			} catch {
				if (mounted) setBookedSlots([]);
			} finally {
				if (mounted) setLoading((s) => ({ ...s, slots: false }));
			}
		})();
		return () => {
			mounted = false;
		};
	}, [selectedDoctorId, selectedDate]);

	const filteredDoctors = useMemo(() => {
		if (!selectedDept) return [];
		return doctors.length ? doctors : FALLBACK_DOCTORS.filter((d) => d.specialtyId === selectedDept);
	}, [doctors, selectedDept]);

	const currentDoctor = doctors.find((d) => d.id === selectedDoctorId) ?? FALLBACK_DOCTORS.find((d) => d.id === selectedDoctorId);

	const isDayAvailable = (isoDateStr: string) => {
		if (!currentDoctor || !currentDoctor.availableDays) return false;
		const date = new Date(isoDateStr + "T00:00:00");
		const todayStart = startOfDay(new Date());
		const dayStart = startOfDay(date);
		return currentDoctor.availableDays.includes(date.getDay()) && dayStart >= todayStart;
	};

	const isSlotBooked = (slot: string) => bookedSlots.includes(slot);

	const toggleSlot = (slot: string) => {
		if (isSlotBooked(slot)) return;
		setSelectedTime((s) => (s === slot ? "" : slot));
	};

	const validateSymptom = (text: string) => {
		if (!text || text.trim().length === 0) return "Symptoms is required.";
		if (text.trim().length < 10) return "Symptoms must be at least 10 characters.";
		return null;
	};

	const handleAiSuggest = async () => {
		const err = validateSymptom(symptom);
		setSymptomError(err);
		if (err) return;
		setLoading((s) => ({ ...s, ai: true }));
		try {
			const res = await fetch("/api/ai-suggest", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ symptom }),
			});
			if (!res.ok) {
				throw new Error("AI service failed");
			}
			const data = (await res.json()) as { suggestions: Department[] };
			setAiSuggestions(data.suggestions || []);
			if (data.suggestions?.length) setSelectedDept(data.suggestions[0].id);
		} catch (err) {
			console.error(err);
			setAiSuggestions(null);
			alert("AI suggestion failed. You can continue manually.");
		} finally {
			setLoading((s) => ({ ...s, ai: false }));
		}
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		const err = validateSymptom(symptom);
		setSymptomError(err);
		if (err) return;

		if (!selectedDept || !selectedDoctorId || !selectedDate || !selectedTime) {
			alert("Please fill Department, Doctor, Date and Time before submitting the appointment.");
			return;
		}

		setLoading((s) => ({ ...s, submit: true }));
		try {
			const payload = {
				doctorId: selectedDoctorId,
				date: selectedDate,
				time: selectedTime,
				symptom,
			};
			const res = await fetch("/api/bookings", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
			if (!res.ok) {
				const errBody = await res.json().catch(() => ({}));
				throw new Error(errBody?.error || "Booking failed");
			}
			alert("Appointment successfully booked.");
			setSymptom("");
			setAiSuggestions(null);
			setSelectedDept("");
			setSelectedDoctorId("");
			setSelectedDate(undefined);
			setSelectedTime("");
		} catch (err) {
			console.error(err);
			alert("Booking failed. Try again.");
		} finally {
			setLoading((s) => ({ ...s, submit: false }));
		}
	};

	return (
		<div className="p-4 md:p-8">
			<Card className="max-w-5xl mx-auto shadow">
				<CardHeader>
					<CardTitle className="text-2xl">Schedule an Appointment</CardTitle>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
						<div className="space-y-4 lg:col-span-1">
							<h3 className="font-semibold">1. Symptoms</h3>
							<div>
								<Label htmlFor="symptom">Symptoms / Reason for visit</Label>
								<Textarea
									id="symptom"
									value={symptom}
									onChange={(e) => {
										setSymptom(e.target.value);
										if (symptomError) setSymptomError(validateSymptom(e.target.value));
									}}
									placeholder="Describe your symptoms..."
								/>
								{symptomError && <p className="text-sm text-red-600 mt-1">{symptomError}</p>}
							</div>

							<div className="flex gap-2 mt-2">
								<Button type="button" onClick={handleAiSuggest} disabled={loading.ai}>
									{loading.ai ? "Analyzing..." : "Next (AI Suggest) "}
								</Button>
								<Button
									type="button"
									variant="outline"
									onClick={() => {
										setSymptom("");
										setSymptomError(null);
										setAiSuggestions(null);
									}}
								>
									Clear
								</Button>
							</div>

							{aiSuggestions && (
								<div className="mt-4">
									<Label>AI Suggested Departments</Label>
									<div className="flex flex-col gap-2 mt-2">
										{aiSuggestions.length === 0 && <div className="text-sm text-muted-foreground">No suggestions</div>}
										{aiSuggestions.map((s) => (
											<Button
												key={s.id}
												type="button"
												onClick={() => setSelectedDept(s.id)}
												className={cn("justify-start", selectedDept === s.id ? "bg-green-600 text-white" : "")}
											>
												{s.name}
											</Button>
										))}
									</div>
								</div>
							)}

							<div className="mt-4">
								<Label htmlFor="department">Department / Specialty (you can override AI)</Label>
								<select
									id="department"
									value={selectedDept}
									onChange={(e) => setSelectedDept(e.target.value)}
									className="w-full border rounded px-2 py-1"
								>
									<option value="">{loading.deps ? "Loading departments..." : "Select a department"}</option>
									{(departments.length ? departments : FALLBACK_DEPARTMENTS).map((dept) => (
										<option key={dept.id} value={dept.id}>
											{dept.name}
										</option>
									))}
								</select>
							</div>
						</div>

						<div className="space-y-4 lg:col-span-1">
							<h3 className="font-semibold">2. Select Doctor & Date</h3>

							{/* search input removed per request */}

							<div>
								<Label>Doctor</Label>
								<select
									value={selectedDoctorId}
									onChange={(e) => {
										setSelectedDoctorId(e.target.value);
										setSelectedDate(undefined);
										setSelectedTime("");
									}}
									disabled={!selectedDept || loading.docs}
									className="w-full border rounded px-2 py-1"
								>
									<option value="">{!selectedDept ? "Choose department first" : "Choose a doctor"}</option>
									{filteredDoctors.map((d) => (
										<option key={d.id} value={d.id}>
											{d.name}
										</option>
									))}
								</select>
							</div>

							{selectedDoctorId && (
								<div>
									<Label>Select date</Label>
									<input
										type="date"
										value={selectedDate ?? ""}
										onChange={(e) => {
											const v = e.target.value || undefined;
											if (v && !isDayAvailable(v)) {
												alert("Selected doctor is not available on this date. Please choose another date.");
												setSelectedDate(undefined);
												setSelectedTime("");
												return;
											}
											setSelectedDate(v);
											setSelectedTime("");
										}}
										className="w-full border rounded px-2 py-1"
									/>
								</div>
							)}
						</div>

						<div className="space-y-4 lg:col-span-1">
							<h3 className="font-semibold">3. Choose Time & Confirm</h3>

							<div>
								<Label>Available time slots</Label>
								<div className="grid grid-cols-2 gap-2 mt-2">
									{DEFAULT_TIME_SLOTS.map((slot) => {
										const booked = isSlotBooked(slot);
										const selected = selectedTime === slot;
										return (
											<Button
												key={slot}
												type="button"
												onClick={() => toggleSlot(slot)}
												disabled={!selectedDate || !selectedDoctorId || booked}
												className={cn(
													"justify-start",
													booked ? "bg-red-100 text-red-600 border-red-200 cursor-not-allowed" : "",
													selected ? "bg-green-600 text-white" : ""
												)}
											>
												<span className="mr-2 font-medium">{slot}</span>
												{booked ? <span className="text-sm">(Booked)</span> : null}
											</Button>
										);
									})}
								</div>
								<p className="text-sm text-muted-foreground mt-2">Green = selected. Red = already booked.</p>
							</div>

							<div>
								<Button
									type="submit"
									className="w-full"
									disabled={
										loading.submit || !!validateSymptom(symptom) || !selectedDept || !selectedDoctorId || !selectedDate || !selectedTime
									}
								>
									{loading.submit ? "Submitting..." : "Confirm Appointment"}
								</Button>
							</div>
						</div>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}