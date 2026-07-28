import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { appointmentSlots, hospitalCatalogControls } from "../../../../db/schema";
import { HOSPITAL_DEPARTMENTS } from "../../_hospital_catalog";
import { forbidden, identityFromRequest, unauthorized, writeAudit } from "../../_lib";

function requireDirectoryManager(request: Request) {
  const identity = identityFromRequest(request);
  if (!identity) return { error: unauthorized() };
  if (identity.role !== "reviewer" || !identity.permissions.includes("directory:manage")) return { error: forbidden() };
  return { identity };
}

export async function GET(request: Request) {
  const auth = requireDirectoryManager(request);
  if ("error" in auth) return auth.error;
  const db = getDb();
  const controls = await db.select().from(hospitalCatalogControls);
  const controlMap = new Map(controls.map((item) => [item.id, item]));
  const departments = HOSPITAL_DEPARTMENTS.map((department) => ({
    code: department.code,
    name: department.name,
    active: controlMap.get(`department:${department.code}`)?.active ?? true,
    doctors: department.doctors.map((name) => ({
      id: `doctor:${department.code}:${name}`,
      name,
      active: controlMap.get(`doctor:${department.code}:${name}`)?.active ?? true,
    })),
  }));
  const slots = await db.select().from(appointmentSlots).orderBy(asc(appointmentSlots.startTime)).limit(250);
  return Response.json({ departments, slots });
}

export async function PATCH(request: Request) {
  const auth = requireDirectoryManager(request);
  if ("error" in auth) return auth.error;
  const body = await request.json() as {
    entity_type?: "department" | "doctor";
    department_code?: string;
    display_name?: string;
    active?: boolean;
    slot_id?: string;
    slot_status?: "available" | "unavailable";
  };
  const db = getDb();
  if (body.slot_id) {
    const [slot] = await db.select().from(appointmentSlots).where(eq(appointmentSlots.id, body.slot_id)).limit(1);
    if (!slot) return Response.json({ detail: "Slot not found" }, { status: 404 });
    if (slot.status === "booked" || slot.bookedWorkflowId) {
      return Response.json({ detail: "A booked slot cannot be disabled or overwritten." }, { status: 409 });
    }
    const status = body.slot_status === "unavailable" ? "unavailable" : "available";
    await db.update(appointmentSlots).set({ status, updatedAt: new Date().toISOString() }).where(eq(appointmentSlots.id, slot.id));
    await writeAudit({ role: auth.identity.role, action: "directory.slot.updated", entityType: "appointment_slot", entityId: slot.id, metadata: { status } });
    return Response.json({ ok: true, status });
  }
  if (!body.entity_type || !body.department_code || !body.display_name || typeof body.active !== "boolean") {
    return Response.json({ detail: "A valid catalog entity and active state are required." }, { status: 400 });
  }
  const department = HOSPITAL_DEPARTMENTS.find((item) => item.code === body.department_code);
  if (!department || (body.entity_type === "doctor" && !department.doctors.includes(body.display_name))) {
    return Response.json({ detail: "Catalog entity is not part of the approved hospital directory." }, { status: 400 });
  }
  const id = body.entity_type === "department"
    ? `department:${department.code}`
    : `doctor:${department.code}:${body.display_name}`;
  const updatedAt = new Date().toISOString();
  await db.insert(hospitalCatalogControls).values({
    id,
    entityType: body.entity_type,
    departmentCode: department.code,
    displayName: body.display_name,
    active: body.active,
    updatedAt,
  }).onConflictDoUpdate({ target: hospitalCatalogControls.id, set: { active: body.active, updatedAt } });
  await writeAudit({ role: auth.identity.role, action: "directory.catalog.updated", entityType: body.entity_type, entityId: id, metadata: { active: body.active } });
  return Response.json({ ok: true, id, active: body.active });
}

export async function POST(request: Request) {
  const auth = requireDirectoryManager(request);
  if ("error" in auth) return auth.error;
  const body = await request.json() as { department_code?: string; doctor_name?: string; start_time?: string };
  const department = HOSPITAL_DEPARTMENTS.find((item) => item.code === body.department_code);
  if (!department || !body.doctor_name || !department.doctors.includes(body.doctor_name)) {
    return Response.json({ detail: "Choose a doctor from the approved department directory." }, { status: 400 });
  }
  const start = new Date(body.start_time || "");
  if (!Number.isFinite(start.getTime()) || start.getTime() <= Date.now()) {
    return Response.json({ detail: "A future appointment time is required." }, { status: 400 });
  }
  const db = getDb();
  const id = `staff-slot-${crypto.randomUUID()}`;
  try {
    await db.insert(appointmentSlots).values({
      id,
      departmentCode: department.code,
      doctorName: body.doctor_name,
      startTime: start.toISOString(),
      status: "available",
    });
  } catch {
    return Response.json({ detail: "That doctor already has a slot at this time." }, { status: 409 });
  }
  await writeAudit({ role: auth.identity.role, action: "directory.slot.created", entityType: "appointment_slot", entityId: id, metadata: { department_code: department.code, doctor_name: body.doctor_name, start_time: start.toISOString() } });
  return Response.json({ id, status: "available" }, { status: 201 });
}
