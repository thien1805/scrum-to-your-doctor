// Define the AppointmentsResponse type or import it from the correct module
type AppointmentsResponse = any; // Replace 'any' with the actual shape if known

export async function fetchAppointments(params?: { status?: string; sort?: "asc" | "desc" }) {
  const qp = new URLSearchParams();
  if (params?.status) qp.set("status", params.status);
  if (params?.sort) qp.set("sort", params.sort);
  const url = `/api/appointments${qp.toString() ? `?${qp.toString()}` : ""}`;

  const res = await fetch(url, { method: "GET", credentials: "include", cache: "no-store" });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("FAILED");
  return (await res.json()) as AppointmentsResponse;
}
