import re


SPECIALTIES = [
    ("general-medicine", "General Medicine (Internal Medicine)", "persistent fever, fatigue, unexplained weight loss, multiple symptoms, adult checkup"),
    ("family-medicine", "Family Medicine", "routine checkup, cough, minor illness, preventive care, ongoing primary care"),
    ("emergency-medicine", "Emergency Medicine", "severe injury, chest pain, difficulty breathing, loss of consciousness, severe bleeding"),
    ("cardiology", "Cardiology", "palpitations, chest discomfort, high blood pressure, leg swelling, abnormal ECG"),
    ("neurology", "Neurology", "headache, seizure, numbness, tremor, memory problems"),
    ("neurosurgery", "Neurosurgery", "brain or spine surgery consultation, nerve compression, brain tumor surgery"),
    ("orthopedic-surgery", "Orthopedic Surgery", "joint pain, leg pain, fracture, back pain, sports injury"),
    ("general-surgery", "General Surgery", "hernia, gallbladder problem, appendix problem, abdominal lump, surgical wound"),
    ("plastic-surgery", "Plastic Surgery", "burn reconstruction, scar revision, hand reconstruction, complex wound"),
    ("vascular-surgery", "Vascular Surgery", "varicose veins, poor circulation, leg ulcer, arterial blockage"),
    ("thoracic-surgery", "Thoracic Surgery", "lung surgery consultation, chest wall mass, mediastinal mass, pleural disease"),
    ("cardiac-surgery", "Cardiac Surgery", "bypass surgery, heart valve surgery, aortic surgery, post-surgery review"),
    ("gastroenterology", "Gastroenterology", "abdominal pain, acid reflux, diarrhea, constipation, difficulty swallowing"),
    ("hepatology", "Hepatology", "jaundice, hepatitis, fatty liver, cirrhosis, abnormal liver tests"),
    ("pulmonology", "Pulmonology", "chronic cough, wheezing, shortness of breath, sleep apnea, abnormal lung test"),
    ("nephrology", "Nephrology", "chronic kidney disease, abnormal creatinine, protein in urine, dialysis care"),
    ("urology", "Urology", "urinary difficulty, kidney stones, prostate problem, blood in urine"),
    ("endocrinology", "Endocrinology", "diabetes, thyroid problem, hormone disorder, adrenal or metabolic disorder"),
    ("rheumatology", "Rheumatology", "joint stiffness, autoimmune disease, lupus, inflammatory arthritis, vasculitis"),
    ("hematology", "Hematology", "anemia, bleeding or clotting disorder, abnormal blood count, bone marrow problem"),
    ("oncology", "Oncology", "cancer evaluation, chemotherapy consultation, tumor follow-up, cancer survivorship"),
    ("dermatology", "Dermatology", "skin rash, acne, changing mole, skin lesion, eczema"),
    ("ophthalmology", "Ophthalmology", "vision changes, eye pain, cataract, glaucoma, retina problem"),
    ("ent", "ENT (Otolaryngology)", "ear pain, hearing loss, sinus problem, tonsil problem, voice change"),
    ("gynecology", "Gynecology", "menstrual problem, pelvic pain, cervical screening, menopause, ovarian cyst"),
    ("obstetrics", "Obstetrics", "pregnancy care, prenatal visit, high-risk pregnancy, postpartum review"),
    ("pediatrics", "Pediatrics", "child fever, growth concern, vaccination, child illness, developmental concern"),
    ("psychiatry", "Psychiatry", "depression, anxiety, psychosis, mood changes, sleep and mood problem"),
    ("infectious-disease", "Infectious Disease", "persistent fever, complex infection, travel infection, HIV care"),
    ("allergy-immunology", "Allergy & Immunology", "seasonal or food allergy, immune deficiency, recurrent allergy, hives"),
    ("radiology", "Radiology", "X-ray appointment, CT scan, MRI scan, ultrasound, imaging-guided procedure"),
    ("nuclear-medicine", "Nuclear Medicine", "PET scan, thyroid uptake scan, bone scan, radionuclide therapy"),
    ("pathology", "Pathology", "biopsy review, tissue diagnosis, pathology second opinion, cytology review"),
    ("anesthesiology", "Anesthesiology", "preoperative anesthesia review, sedation planning, airway assessment"),
    ("pain-medicine", "Pain Medicine", "chronic pain, nerve pain, complex regional pain, back pain procedure"),
    ("rehabilitation-medicine", "Rehabilitation Medicine", "stroke recovery, injury rehabilitation, mobility or functional impairment"),
    ("sports-medicine", "Sports Medicine", "sports injury, overuse injury, return to sport, exercise-related pain"),
    ("critical-care-medicine", "Critical Care Medicine", "organ support, severe illness, ventilator care, critical illness recovery"),
    ("geriatrics", "Geriatrics", "frailty, falls, memory decline, multiple medications, older adult assessment"),
    ("palliative-care", "Palliative Care", "advanced illness support, symptom support, goals of care, caregiver support"),
    ("medical-genetics", "Medical Genetics", "inherited condition, genetic family history, genetic test counseling, rare disease"),
    ("preventive-medicine", "Preventive Medicine", "health screening, vaccination planning, risk assessment, prevention"),
]

FIRST_NAMES = [
    "Aarav", "Aisha", "Amelia", "Daniel", "Elena", "Elias", "Fatima", "Gabriel", "Hana",
    "Ibrahim", "Julia", "Kenji", "Leila", "Mateo", "Nadia", "Oliver", "Priya", "Samuel",
]
LAST_NAMES = ["Adler", "Bennett", "Chen", "Dubois", "Garcia", "Hassan", "Ivanov", "Johansson"]

RAG_CORPUS_VERSION = "2026-07-28.2"
RAG_EMBEDDING_MODEL = "agentcare-private-semantic-hash-v1"

TERMINOLOGY = {
    "pain": ["pain", "pains", "painful", "paining", "hurts", "hurt", "aching", "burning", "stinging", "sore"],
    "urination": ["urination", "urinating", "urinate", "urine", "pee", "peeing", "pass urine", "passing urine", "pass water", "passing water"],
    "difficulty": ["difficulty", "difficult", "hard to", "unable to", "cannot", "can't", "trouble"],
    "frequency": ["frequent", "frequently", "often", "many times", "all the time"],
    "skin": ["skin", "body surface"],
    "rash": ["rash", "rashes", "spots", "itchy patches", "skin breakout"],
    "eye": ["eye", "eyes", "vision", "sight"],
    "ear": ["ear", "ears"],
    "hearing_loss": ["hearing loss", "cannot hear", "can't hear", "reduced hearing", "hearing problem"],
    "breathing": ["breathing", "breathe", "breath", "short of breath", "breathless"],
    "wheeze": ["wheeze", "wheezing", "whistling breath"],
    "abdomen": ["abdomen", "abdominal", "belly", "stomach", "tummy"],
    "reflux": ["acid reflux", "heartburn", "acid coming up", "sour taste"],
    "joint": ["joint", "joints", "knee", "knees", "shoulder", "shoulders", "hip", "hips"],
    "leg": ["leg", "legs", "limb", "limbs"],
    "fracture": ["fracture", "fractured", "broken bone", "bone break"],
    "heart_rhythm": ["palpitation", "palpitations", "heart racing", "racing heart", "heart pounding", "irregular heartbeat"],
    "heart_area": ["heart", "heart area", "cardiac area", "chest", "chest area", "centre of chest", "center of chest"],
    "pressure": ["pressure", "tightness", "tight", "heaviness", "squeezing"],
    "headache": ["headache", "head pain", "migraine"],
    "numbness": ["numbness", "numb", "pins and needles", "tingling"],
    "hives": ["hives", "welts", "allergic rash"],
    "thyroid": ["thyroid", "thyroid gland"],
    "menstrual": ["menstrual", "period problem", "periods", "menstruation"],
    "pregnancy": ["pregnancy", "pregnant", "prenatal", "expecting a baby"],
    "child": ["child", "children", "kid", "kids", "baby", "infant"],
    "fever": ["fever", "feverish", "high temperature"],
}

ROUTING_CONCEPTS = [
    ("urology-painful-urination", "urology", "painful urination", ["urination", "pain"], "route"),
    ("urology-voiding-difficulty", "urology", "difficulty passing urine", ["urination", "difficulty"], "route"),
    ("urology-frequency", "urology", "urinary frequency", ["urination", "frequency"], "route"),
    ("dermatology-skin-rash", "dermatology", "skin rash", ["skin", "rash"], "route"),
    ("ophthalmology-eye-pain", "ophthalmology", "eye pain", ["eye", "pain"], "review"),
    ("ent-ear-pain", "ent", "ear pain", ["ear", "pain"], "route"),
    ("ent-hearing-loss", "ent", "hearing problem", ["ear", "hearing_loss"], "review"),
    ("pulmonology-wheeze", "pulmonology", "wheezing", ["breathing", "wheeze"], "review"),
    ("gastroenterology-abdominal-pain", "gastroenterology", "abdominal pain", ["abdomen", "pain"], "review"),
    ("gastroenterology-reflux", "gastroenterology", "acid reflux", ["reflux"], "route"),
    ("orthopedics-joint-pain", "orthopedic-surgery", "joint pain", ["joint", "pain"], "review"),
    ("orthopedics-leg-pain", "orthopedic-surgery", "leg pain", ["leg", "pain"], "review"),
    ("orthopedics-fracture", "orthopedic-surgery", "fracture follow-up", ["fracture"], "route"),
    ("cardiology-heart-area-pain", "cardiology", "heart or chest-area pain", ["heart_area", "pain"], "review"),
    ("cardiology-heart-area-pressure", "cardiology", "heart or chest-area pressure", ["heart_area", "pressure"], "review"),
    ("cardiology-palpitations", "cardiology", "palpitations", ["heart_rhythm"], "review"),
    ("neurology-headache", "neurology", "headache", ["headache"], "review"),
    ("neurology-numbness", "neurology", "numbness or tingling", ["numbness"], "review"),
    ("allergy-hives", "allergy-immunology", "hives", ["hives"], "review"),
    ("endocrinology-thyroid", "endocrinology", "thyroid problem", ["thyroid"], "route"),
    ("gynecology-menstrual", "gynecology", "menstrual problem", ["menstrual"], "route"),
    ("obstetrics-pregnancy", "obstetrics", "pregnancy care", ["pregnancy"], "route"),
    ("pediatrics-child-fever", "pediatrics", "child fever", ["child", "fever"], "review"),
]


def doctor_name(index: int) -> str:
    return f"Dr. {FIRST_NAMES[index % len(FIRST_NAMES)]} {LAST_NAMES[(index // len(FIRST_NAMES)) % len(LAST_NAMES)]}"


def validate_catalog() -> None:
    names = [doctor_name(index) for index in range(len(SPECIALTIES) * 3)]
    if len(SPECIALTIES) != 42 or len(names) != len(set(names)):
        raise RuntimeError("Hospital catalog must contain 42 specialties and globally unique doctors.")


def canonical_terms(value: str) -> set[str]:
    text = value.lower()
    return {
        canonical
        for canonical, synonyms in TERMINOLOGY.items()
        if any(
            re.search(
                r"\b" + re.escape(synonym).replace(r"\ ", r"\s+") + r"\b",
                text,
            )
            for synonym in synonyms
        )
    }


def cardiovascular_safety_signal(value: str) -> bool:
    terms = canonical_terms(value)
    return "heart_area" in terms and bool({"pain", "pressure"} & terms)


def concepts_for_department(department_code: str):
    return [concept for concept in ROUTING_CONCEPTS if concept[1] == department_code]


def match_routing_concepts(value: str):
    terms = canonical_terms(value)
    matches = [
        concept
        for concept in ROUTING_CONCEPTS
        if all(required in terms for required in concept[3])
    ]
    scores: dict[str, int] = {}
    for _, department_code, _, required, _ in matches:
        scores[department_code] = scores.get(department_code, 0) + len(required)
    ranked = sorted(scores.items(), key=lambda item: (-item[1], item[0]))
    leading = matches[0] if matches else None
    unique_lead = bool(
        leading
        and ranked
        and ranked[0][0] == leading[1]
        and (len(ranked) == 1 or ranked[0][1] > ranked[1][1])
    )
    return {
        "canonical_terms": sorted(terms),
        "matches": matches,
        "leading": leading,
        "can_route": bool(leading and leading[4] == "route" and unique_lead),
    }
