import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { demoPatientProfiles } from "../../../db/schema";
import { forbidden, identityFromRequest, unauthorized, writeAudit } from "../_lib";

export async function GET(request: Request) {
  const identity = identityFromRequest(request);
  if (!identity) return unauthorized();
  if (!identity.patientId || !identity.permissions.includes("profile:self-service")) return forbidden();
  const db = getDb();
  const [profile] = await db.select().from(demoPatientProfiles).where(eq(demoPatientProfiles.patientId, identity.patientId)).limit(1);
  return Response.json({
    patient_id: identity.patientId,
    name: identity.name,
    email: identity.email,
    phone: profile?.phone || "",
    preferred_language: profile?.preferredLanguage || "en",
    emergency_contact: profile?.emergencyContact || "",
    updated_at: profile?.updatedAt || null,
  });
}

export async function PUT(request: Request) {
  const identity = identityFromRequest(request);
  if (!identity) return unauthorized();
  if (!identity.patientId || !identity.permissions.includes("profile:self-service")) return forbidden();
  const body = await request.json() as { phone?: string; preferred_language?: string; emergency_contact?: string };
  const phone = body.phone?.trim().slice(0, 40) || null;
  const preferredLanguage = body.preferred_language?.trim().slice(0, 10) || "en";
  const emergencyContact = body.emergency_contact?.trim().slice(0, 160) || null;
  const updatedAt = new Date().toISOString();
  const db = getDb();
  await db.insert(demoPatientProfiles).values({
    patientId: identity.patientId,
    phone,
    preferredLanguage,
    emergencyContact,
    updatedAt,
  }).onConflictDoUpdate({
    target: demoPatientProfiles.patientId,
    set: { phone, preferredLanguage, emergencyContact, updatedAt },
  });
  await writeAudit({
    role: identity.role,
    action: "patient.profile.updated",
    entityType: "patient_profile",
    entityId: identity.patientId,
    metadata: { fields: ["phone", "preferred_language", "emergency_contact"] },
  });
  return GET(request);
}
