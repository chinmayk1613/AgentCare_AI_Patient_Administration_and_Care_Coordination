import math
import re
from datetime import datetime, timezone

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .hospital_catalog import RAG_EMBEDDING_MODEL, canonical_terms
from .models import PolicyDocument


STOP_WORDS = {"the", "a", "an", "to", "for", "and", "i", "my", "need", "want"}
VECTOR_DIMENSIONS = 128


def _tokens(value: str) -> list[str]:
    return [
        token
        for token in re.findall(r"[a-zA-Z]{3,}", value.lower())
        if token not in STOP_WORDS
    ]


def _hash_feature(value: str) -> int:
    result = 2166136261
    for character in value:
        result ^= ord(character)
        result = (result * 16777619) & 0xFFFFFFFF
    return result


def _embed(value: str) -> list[float]:
    tokens = _tokens(value) + [f"concept:{term}" for term in sorted(canonical_terms(value))]
    features = tokens + [
        f"{tokens[index]}::{tokens[index + 1]}"
        for index in range(len(tokens) - 1)
    ]
    vector = [0.0] * VECTOR_DIMENSIONS
    for feature in features:
        vector[_hash_feature(feature) % VECTOR_DIMENSIONS] += (
            2.0 if feature.startswith("concept:") else 1.0
        )
    magnitude = math.sqrt(sum(item * item for item in vector)) or 1.0
    return [item / magnitude for item in vector]


def _chunks(policy: PolicyDocument) -> list[str]:
    """Parse one policy and create bounded semantic sentence chunks."""
    sentences = [
        item.strip()
        for item in re.split(r"(?<=[.!?])\s+", policy.body)
        if item.strip()
    ]
    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        candidate = f"{current} {sentence}".strip()
        if current and len(candidate) > 360:
            chunks.append(current)
            current = sentence
        else:
            current = candidate
    if current:
        chunks.append(current)
    return chunks or [policy.body]


def retrieve_policy(db: Session, query: str, limit: int = 3) -> list[dict]:
    """Parse, chunk, embed, and retrieve approved versioned policy evidence."""
    now = datetime.now(timezone.utc)
    query_concepts = canonical_terms(query)
    tokens = set(_tokens(query)) | query_concepts
    query_embedding = _embed(query)
    stmt = select(PolicyDocument).where(
        PolicyDocument.status == "active",
        PolicyDocument.effective_from <= now,
        or_(PolicyDocument.effective_to.is_(None), PolicyDocument.effective_to >= now),
    )
    candidates = list(db.scalars(stmt))
    scored: list[tuple[float, PolicyDocument, int, str]] = []
    for policy in candidates:
        for chunk_index, chunk in enumerate(_chunks(policy)):
            haystack = f"{policy.title} {chunk} {policy.department_code or ''}".lower()
            chunk_concepts = canonical_terms(haystack)
            chunk_tokens = set(_tokens(haystack)) | chunk_concepts
            lexical = len(tokens & chunk_tokens) / max(len(tokens), 1)
            concept_score = (
                len(query_concepts & chunk_concepts) / len(query_concepts)
                if query_concepts
                else 0.0
            )
            vector = sum(
                left * right
                for left, right in zip(query_embedding, _embed(haystack))
            )
            score = (
                max(0.0, vector) * 0.45
                + lexical * 0.15
                + concept_score * 0.4
            )
            if score > 0.04:
                scored.append((score, policy, chunk_index, chunk))
    scored.sort(key=lambda item: (-item[0], item[1].policy_key, item[2]))
    return [
        {
            "evidence_ref": (
                f"policy:{policy.policy_key}:{policy.version}#chunk-{chunk_index}"
            ),
            "title": policy.title,
            "department_code": policy.department_code,
            "excerpt": chunk[:360],
            "score": round(score, 4),
            "chunk_index": chunk_index,
            "embedding_model": RAG_EMBEDDING_MODEL,
        }
        for score, policy, chunk_index, chunk in scored[:limit]
    ]
