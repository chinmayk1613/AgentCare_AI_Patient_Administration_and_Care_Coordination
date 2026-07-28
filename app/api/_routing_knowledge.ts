export const RAG_CORPUS_VERSION = "2026-07-28.2";
export const RAG_EMBEDDING_MODEL = "agentcare-private-semantic-hash-v1";

export type TerminologyEntry = {
  canonical: string;
  synonyms: string[];
};

export type ApprovedRoutingConcept = {
  id: string;
  departmentCode: string;
  label: string;
  requiredTerms: string[];
  autonomy: "route" | "review";
  rationale: string;
};

export const TERMINOLOGY: TerminologyEntry[] = [
  { canonical: "pain", synonyms: ["pain", "pains", "painful", "paining", "hurts", "hurt", "aching", "burning", "stinging", "sore"] },
  { canonical: "urination", synonyms: ["urination", "urinating", "urinate", "urine", "pee", "peeing", "pass urine", "passing urine", "pass water", "passing water"] },
  { canonical: "difficulty", synonyms: ["difficulty", "difficult", "hard to", "unable to", "cannot", "can't", "trouble"] },
  { canonical: "frequency", synonyms: ["frequent", "frequently", "often", "many times", "all the time"] },
  { canonical: "urgency", synonyms: ["urgent need", "sudden need", "cannot hold", "can't hold", "rush to"] },
  { canonical: "blood", synonyms: ["blood", "bleeding", "bloody"] },
  { canonical: "skin", synonyms: ["skin", "body surface"] },
  { canonical: "rash", synonyms: ["rash", "rashes", "spots", "itchy patches", "skin breakout"] },
  { canonical: "eye", synonyms: ["eye", "eyes", "vision", "sight"] },
  { canonical: "vision_change", synonyms: ["blurred vision", "blurry vision", "vision change", "cannot see clearly", "can't see clearly"] },
  { canonical: "ear", synonyms: ["ear", "ears"] },
  { canonical: "hearing_loss", synonyms: ["hearing loss", "cannot hear", "can't hear", "reduced hearing", "hearing problem"] },
  { canonical: "breathing", synonyms: ["breathing", "breathe", "breath", "short of breath", "breathless"] },
  { canonical: "wheeze", synonyms: ["wheeze", "wheezing", "whistling breath"] },
  { canonical: "cough", synonyms: ["cough", "coughing"] },
  { canonical: "abdomen", synonyms: ["abdomen", "abdominal", "belly", "stomach", "tummy"] },
  { canonical: "reflux", synonyms: ["acid reflux", "heartburn", "acid coming up", "sour taste"] },
  { canonical: "joint", synonyms: ["joint", "joints", "knee", "knees", "shoulder", "shoulders", "hip", "hips"] },
  { canonical: "leg", synonyms: ["leg", "legs", "limb", "limbs"] },
  { canonical: "fracture", synonyms: ["fracture", "fractured", "broken bone", "bone break"] },
  { canonical: "heart_rhythm", synonyms: ["palpitation", "palpitations", "heart racing", "racing heart", "heart pounding", "irregular heartbeat"] },
  { canonical: "heart_area", synonyms: ["heart", "heart area", "cardiac area", "chest", "chest area", "centre of chest", "center of chest"] },
  { canonical: "pressure", synonyms: ["pressure", "tightness", "tight", "heaviness", "squeezing"] },
  { canonical: "headache", synonyms: ["headache", "head pain", "migraine"] },
  { canonical: "numbness", synonyms: ["numbness", "numb", "pins and needles", "tingling"] },
  { canonical: "hives", synonyms: ["hives", "welts", "allergic rash"] },
  { canonical: "thyroid", synonyms: ["thyroid", "thyroid gland"] },
  { canonical: "menstrual", synonyms: ["menstrual", "period problem", "periods", "menstruation"] },
  { canonical: "pregnancy", synonyms: ["pregnancy", "pregnant", "prenatal", "expecting a baby"] },
  { canonical: "child", synonyms: ["child", "children", "kid", "kids", "baby", "infant"] },
  { canonical: "fever", synonyms: ["fever", "feverish", "high temperature"] },
];

export const APPROVED_ROUTING_CONCEPTS: ApprovedRoutingConcept[] = [
  {
    id: "urology-painful-urination",
    departmentCode: "urology",
    label: "painful urination",
    requiredTerms: ["urination", "pain"],
    autonomy: "route",
    rationale: "Approved administrative terminology maps urinary pain requests to Urology without asserting a diagnosis.",
  },
  {
    id: "urology-voiding-difficulty",
    departmentCode: "urology",
    label: "difficulty passing urine",
    requiredTerms: ["urination", "difficulty"],
    autonomy: "route",
    rationale: "Approved administrative terminology maps voiding-difficulty requests to Urology.",
  },
  {
    id: "urology-frequency",
    departmentCode: "urology",
    label: "urinary frequency or urgency",
    requiredTerms: ["urination", "frequency"],
    autonomy: "route",
    rationale: "Approved administrative terminology maps urinary-frequency requests to Urology.",
  },
  {
    id: "dermatology-skin-rash",
    departmentCode: "dermatology",
    label: "skin rash",
    requiredTerms: ["skin", "rash"],
    autonomy: "route",
    rationale: "Approved administrative terminology maps an explicit skin-rash appointment request to Dermatology.",
  },
  {
    id: "ophthalmology-eye-pain",
    departmentCode: "ophthalmology",
    label: "eye pain",
    requiredTerms: ["eye", "pain"],
    autonomy: "review",
    rationale: "Eye pain may need urgency assessment, so the evidence recommends Ophthalmology but retains review.",
  },
  {
    id: "ophthalmology-vision-change",
    departmentCode: "ophthalmology",
    label: "vision change",
    requiredTerms: ["eye", "vision_change"],
    autonomy: "review",
    rationale: "Vision change recommends Ophthalmology but retains review because urgency can vary.",
  },
  {
    id: "ent-ear-pain",
    departmentCode: "ent",
    label: "ear pain",
    requiredTerms: ["ear", "pain"],
    autonomy: "route",
    rationale: "Approved administrative terminology maps an ear-pain appointment request to ENT.",
  },
  {
    id: "ent-hearing-loss",
    departmentCode: "ent",
    label: "hearing problem",
    requiredTerms: ["ear", "hearing_loss"],
    autonomy: "review",
    rationale: "Hearing-loss wording recommends ENT but retains review because urgency can vary.",
  },
  {
    id: "pulmonology-wheeze",
    departmentCode: "pulmonology",
    label: "wheezing",
    requiredTerms: ["breathing", "wheeze"],
    autonomy: "review",
    rationale: "Breathing symptoms recommend Pulmonology only after the safety boundary is evaluated.",
  },
  {
    id: "gastroenterology-abdominal-pain",
    departmentCode: "gastroenterology",
    label: "abdominal pain",
    requiredTerms: ["abdomen", "pain"],
    autonomy: "review",
    rationale: "Abdominal pain is evidence for Gastroenterology but can overlap, so review remains required.",
  },
  {
    id: "gastroenterology-reflux",
    departmentCode: "gastroenterology",
    label: "acid reflux",
    requiredTerms: ["reflux"],
    autonomy: "route",
    rationale: "Approved administrative terminology maps a reflux appointment request to Gastroenterology.",
  },
  {
    id: "orthopedics-joint-pain",
    departmentCode: "orthopedic-surgery",
    label: "joint pain",
    requiredTerms: ["joint", "pain"],
    autonomy: "review",
    rationale: "Joint pain recommends Orthopedic Surgery but remains reviewable because specialties can overlap.",
  },
  {
    id: "orthopedics-leg-pain",
    departmentCode: "orthopedic-surgery",
    label: "leg pain",
    requiredTerms: ["leg", "pain"],
    autonomy: "review",
    rationale: "Leg pain recommends Orthopedic Surgery for administrative review while preserving human confirmation for overlapping specialties.",
  },
  {
    id: "orthopedics-fracture",
    departmentCode: "orthopedic-surgery",
    label: "fracture follow-up",
    requiredTerms: ["fracture"],
    autonomy: "route",
    rationale: "Approved administrative terminology maps a non-emergency fracture follow-up request to Orthopedic Surgery.",
  },
  {
    id: "cardiology-heart-area-pain",
    departmentCode: "cardiology",
    label: "heart or chest-area pain",
    requiredTerms: ["heart_area", "pain"],
    autonomy: "review",
    rationale: "Heart or chest-area pain is safety-sensitive. It recommends Cardiology only as context for authorized clinical triage and must never be routed autonomously.",
  },
  {
    id: "cardiology-heart-area-pressure",
    departmentCode: "cardiology",
    label: "heart or chest-area pressure",
    requiredTerms: ["heart_area", "pressure"],
    autonomy: "review",
    rationale: "Heart or chest-area pressure is safety-sensitive. It recommends Cardiology only as context for authorized clinical triage and must never be routed autonomously.",
  },
  {
    id: "cardiology-palpitations",
    departmentCode: "cardiology",
    label: "palpitations",
    requiredTerms: ["heart_rhythm"],
    autonomy: "review",
    rationale: "Heart-rhythm wording recommends Cardiology after safety evaluation but retains review.",
  },
  {
    id: "neurology-headache",
    departmentCode: "neurology",
    label: "headache",
    requiredTerms: ["headache"],
    autonomy: "review",
    rationale: "Headache terminology recommends Neurology but remains reviewable because urgency and overlap vary.",
  },
  {
    id: "neurology-numbness",
    departmentCode: "neurology",
    label: "numbness or tingling",
    requiredTerms: ["numbness"],
    autonomy: "review",
    rationale: "Numbness terminology recommends Neurology but remains reviewable because urgency can vary.",
  },
  {
    id: "allergy-hives",
    departmentCode: "allergy-immunology",
    label: "hives",
    requiredTerms: ["hives"],
    autonomy: "review",
    rationale: "Hives recommend Allergy & Immunology after the safety boundary is evaluated.",
  },
  {
    id: "endocrinology-thyroid",
    departmentCode: "endocrinology",
    label: "thyroid problem",
    requiredTerms: ["thyroid"],
    autonomy: "route",
    rationale: "Approved administrative terminology maps a thyroid appointment request to Endocrinology.",
  },
  {
    id: "gynecology-menstrual",
    departmentCode: "gynecology",
    label: "menstrual problem",
    requiredTerms: ["menstrual"],
    autonomy: "route",
    rationale: "Approved administrative terminology maps a menstrual-care appointment request to Gynecology.",
  },
  {
    id: "obstetrics-pregnancy",
    departmentCode: "obstetrics",
    label: "pregnancy care",
    requiredTerms: ["pregnancy"],
    autonomy: "route",
    rationale: "Approved administrative terminology maps a routine pregnancy-care request to Obstetrics.",
  },
  {
    id: "pediatrics-child-fever",
    departmentCode: "pediatrics",
    label: "child fever",
    requiredTerms: ["child", "fever"],
    autonomy: "review",
    rationale: "Child-fever wording recommends Pediatrics but retains review because urgency can vary.",
  },
];

function phrasePattern(value: string) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`\\b${escaped}\\b`, "i");
}

export function canonicalTerms(value: string) {
  const lower = value.toLowerCase();
  return new Set(
    TERMINOLOGY
      .filter((entry) => entry.synonyms.some((synonym) => phrasePattern(synonym).test(lower)))
      .map((entry) => entry.canonical),
  );
}

export function cardiovascularSafetySignal(value: string) {
  const terms = canonicalTerms(value);
  return terms.has("heart_area") && (terms.has("pain") || terms.has("pressure"));
}

export function conceptsForDepartment(departmentCode: string) {
  return APPROVED_ROUTING_CONCEPTS.filter((concept) => concept.departmentCode === departmentCode);
}

export function analyzeApprovedConcepts(value: string) {
  const canonical = canonicalTerms(value);
  const matches = APPROVED_ROUTING_CONCEPTS
    .filter((concept) => concept.requiredTerms.every((term) => canonical.has(term)))
    .map((concept) => ({
      ...concept,
      score: concept.requiredTerms.length,
      matched_terms: concept.requiredTerms,
    }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const departments = new Map<string, number>();
  for (const match of matches) {
    departments.set(match.departmentCode, (departments.get(match.departmentCode) || 0) + match.score);
  }
  const rankedDepartments = [...departments.entries()].sort((a, b) => b[1] - a[1]);
  const leading = matches[0];
  const uniqueLead = Boolean(
    leading &&
    rankedDepartments[0]?.[0] === leading.departmentCode &&
    (!rankedDepartments[1] || rankedDepartments[0][1] > rankedDepartments[1][1]),
  );
  return {
    canonical_terms: [...canonical],
    matches,
    leading,
    unique_lead: uniqueLead,
    can_route: Boolean(leading?.autonomy === "route" && uniqueLead),
  };
}
