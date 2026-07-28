import { and, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { ragChunks } from "../../db/schema";
import { HOSPITAL_DEPARTMENTS } from "./_hospital_catalog";
import {
  APPROVED_ROUTING_CONCEPTS,
  RAG_CORPUS_VERSION,
  RAG_EMBEDDING_MODEL,
  TERMINOLOGY,
  canonicalTerms,
  conceptsForDepartment,
} from "./_routing_knowledge";

type ParsedKnowledgeDocument = {
  key: string;
  title: string;
  departmentCode: string | null;
  sections: { type: string; content: string; terms: string[]; metadata: Record<string, unknown> }[];
};

export type RagEvidence = {
  evidence_ref: string;
  chunk_id: string;
  title: string;
  department_code: string | null;
  excerpt: string;
  score: number;
  chunk_type: string;
  embedding_model: string;
};

const VECTOR_DIMENSIONS = 128;
const STOP_WORDS = new Set(["the", "and", "for", "need", "want", "with", "from", "when", "have", "doctor", "appointment"]);

function lexicalTokens(value: string) {
  return (value.toLowerCase().match(/[a-z]{3,}/g) || []).filter((token) => !STOP_WORDS.has(token));
}

function hashFeature(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function embedKnowledgeText(value: string) {
  const canonical = [...canonicalTerms(value)].map((term) => `concept:${term}`);
  const tokens = [...lexicalTokens(value), ...canonical];
  const features = [
    ...tokens,
    ...tokens.slice(0, -1).map((token, index) => `${token}::${tokens[index + 1]}`),
  ];
  const vector = Array.from({ length: VECTOR_DIMENSIONS }, () => 0);
  for (const feature of features) vector[hashFeature(feature) % VECTOR_DIMENSIONS] += feature.startsWith("concept:") ? 2 : 1;
  const magnitude = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0)) || 1;
  return vector.map((item) => Number((item / magnitude).toFixed(6)));
}

function cosine(left: number[], right: number[]) {
  return left.reduce((sum, value, index) => sum + value * (right[index] || 0), 0);
}

function parseKnowledgeDocuments(): ParsedKnowledgeDocument[] {
  const departments = HOSPITAL_DEPARTMENTS.map((department) => {
    const concepts = conceptsForDepartment(department.code);
    const conceptSynonyms = TERMINOLOGY
      .filter((entry) => concepts.some((concept) => concept.requiredTerms.includes(entry.canonical)))
      .flatMap((entry) => entry.synonyms);
    return {
      key: `routing-${department.code}`,
      title: `${department.name} administrative routing and provider directory`,
      departmentCode: department.code,
      sections: [
        {
          type: "routing",
          content: [
            `Approved administrative destination: ${department.name}.`,
            `Common routing signals: ${department.symptoms.join(", ")}.`,
            concepts.length
              ? `Approved terminology concepts: ${concepts.map((concept) => `${concept.label} (${concept.autonomy})`).join(", ")}. Colloquial forms: ${conceptSynonyms.join(", ")}.`
              : "No additional autonomous terminology concepts are approved; uncertain symptom-only routing requires review.",
            "This evidence supports administrative routing only and never establishes a diagnosis.",
          ].join(" "),
          terms: [...department.aliases, ...department.symptoms, ...concepts.map((concept) => concept.label), ...conceptSynonyms],
          metadata: {
            concept_ids: concepts.map((concept) => concept.id),
            autonomy: concepts.map((concept) => ({ id: concept.id, mode: concept.autonomy })),
          },
        },
        {
          type: "providers",
          content: `Active synthetic providers for ${department.name}: ${department.doctors.join(", ")}. Provider assignments are directory evidence; live availability must be queried through MCP.`,
          terms: [...department.aliases, ...department.doctors],
          metadata: { doctors: department.doctors },
        },
      ],
    };
  });
  return [
    ...departments,
    {
      key: "document-ecg",
      title: "Prior ECG document coordination",
      departmentCode: "cardiology",
      sections: [{
        type: "document",
        content: "A prior ECG may be registered as an ECG document after type, checksum, patient-link, duplicate, and safety checks. Never interpret clinical findings.",
        terms: ["cardiology", "ecg", "ekg", "attach", "document"],
        metadata: { document_type: "ECG" },
      }],
    },
    {
      key: "document-mri",
      title: "MRI report document coordination",
      departmentCode: "radiology",
      sections: [{
        type: "document",
        content: "An MRI report may be registered as MRI_REPORT after type, checksum, patient-link, duplicate, and safety checks. Never interpret clinical findings.",
        terms: ["mri", "magnetic resonance", "scan", "imaging", "document"],
        metadata: { document_type: "MRI_REPORT" },
      }],
    },
    {
      key: "safety-boundary",
      title: "Non-clinical autonomy boundary",
      departmentCode: null,
      sections: [{
        type: "guardrail",
        content: "Diagnosis, prescription, dosage, emergency guidance, and clinical-result interpretation require human or emergency escalation. RAG evidence may authorize only administrative routing.",
        terms: ["diagnose", "prescribe", "dosage", "medicine", "emergency", "appointment", "follow-up"],
        metadata: { clinical_interpretation: false },
      }],
    },
  ];
}

function parsedChunks() {
  return parseKnowledgeDocuments().flatMap((document) =>
    document.sections.map((section, index) => {
      const id = `${document.key}:${RAG_CORPUS_VERSION}:${index}`;
      const embedding = embedKnowledgeText(`${document.title} ${section.content} ${section.terms.join(" ")}`);
      return {
        id,
        documentKey: document.key,
        version: RAG_CORPUS_VERSION,
        title: document.title,
        departmentCode: document.departmentCode,
        chunkIndex: index,
        chunkType: section.type,
        content: section.content,
        termsJson: JSON.stringify(section.terms),
        metadataJson: JSON.stringify(section.metadata),
        embeddingJson: JSON.stringify(embedding),
        embeddingModel: RAG_EMBEDDING_MODEL,
        status: "active",
        checksum: hashFeature(`${id}:${section.content}`).toString(16),
        updatedAt: new Date().toISOString(),
      };
    }),
  );
}

async function ensureRagIndex() {
  const db = getDb();
  const chunks = parsedChunks();
  const existing = await db
    .select({ id: ragChunks.id })
    .from(ragChunks)
    .where(and(eq(ragChunks.version, RAG_CORPUS_VERSION), eq(ragChunks.status, "active")));
  if (existing.length === chunks.length) return chunks.length;
  for (let offset = 0; offset < chunks.length; offset += 5) {
    const batch = chunks.slice(offset, offset + 5);
    await db.insert(ragChunks).values(batch).onConflictDoNothing();
  }
  return chunks.length;
}

export async function retrieveRagEvidence(query: string, limit = 5): Promise<RagEvidence[]> {
  await ensureRagIndex();
  const db = getDb();
  const rows = await db
    .select()
    .from(ragChunks)
    .where(and(eq(ragChunks.version, RAG_CORPUS_VERSION), eq(ragChunks.status, "active")));
  const queryVector = embedKnowledgeText(query);
  const queryConcepts = canonicalTerms(query);
  const queryTokens = new Set([...lexicalTokens(query), ...queryConcepts]);
  return rows
    .map((row) => {
      const terms = JSON.parse(row.termsJson) as string[];
      const contentConcepts = canonicalTerms(`${row.content} ${terms.join(" ")}`);
      const contentTokens = new Set([...lexicalTokens(`${row.title} ${row.content} ${terms.join(" ")}`), ...contentConcepts]);
      const overlap = [...queryTokens].filter((token) => contentTokens.has(token)).length;
      const lexicalScore = queryTokens.size ? overlap / queryTokens.size : 0;
      const conceptOverlap = [...queryConcepts].filter((term) => contentConcepts.has(term)).length;
      const conceptScore = queryConcepts.size ? conceptOverlap / queryConcepts.size : 0;
      const vectorScore = Math.max(0, cosine(queryVector, JSON.parse(row.embeddingJson) as number[]));
      const score = vectorScore * 0.45 + lexicalScore * 0.15 + conceptScore * 0.4;
      return { row, score };
    })
    .filter((item) => item.score > 0.04)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ row, score }) => ({
      evidence_ref: `policy:${row.documentKey}:${row.version}#chunk-${row.chunkIndex}`,
      chunk_id: row.id,
      title: row.title,
      department_code: row.departmentCode,
      excerpt: row.content,
      score: Number(score.toFixed(4)),
      chunk_type: row.chunkType,
      embedding_model: row.embeddingModel,
    }));
}

export function ragIndexManifest() {
  const chunks = parsedChunks();
  return {
    corpus_version: RAG_CORPUS_VERSION,
    embedding_model: RAG_EMBEDDING_MODEL,
    parsing: "structured hospital catalog and versioned policy documents",
    chunking: "semantic section chunks: routing, providers, document rules, guardrails",
    chunk_count: chunks.length,
    concept_count: APPROVED_ROUTING_CONCEPTS.length,
  };
}
