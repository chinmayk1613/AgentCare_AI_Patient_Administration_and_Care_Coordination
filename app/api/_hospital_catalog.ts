export type HospitalDepartment = {
  code: string;
  name: string;
  aliases: string[];
  symptoms: string[];
  doctors: string[];
};

type DepartmentSeed = Omit<HospitalDepartment, "doctors">;

const DEPARTMENT_SEEDS: DepartmentSeed[] = [
  { code: "general-medicine", name: "General Medicine (Internal Medicine)", aliases: ["general medicine", "internal medicine", "internist"], symptoms: ["persistent fever", "fatigue", "unexplained weight loss", "multiple symptoms", "adult checkup"] },
  { code: "family-medicine", name: "Family Medicine", aliases: ["family medicine", "family doctor", "primary care"], symptoms: ["routine checkup", "cough", "minor illness", "preventive care", "ongoing primary care"] },
  { code: "emergency-medicine", name: "Emergency Medicine", aliases: ["emergency medicine", "emergency department", "emergency room"], symptoms: ["severe injury", "chest pain", "difficulty breathing", "loss of consciousness", "severe bleeding"] },
  { code: "cardiology", name: "Cardiology", aliases: ["cardiology", "cardiologist", "cardiac clinic"], symptoms: ["palpitations", "chest discomfort", "high blood pressure", "leg swelling", "abnormal ecg"] },
  { code: "neurology", name: "Neurology", aliases: ["neurology", "neurologist"], symptoms: ["headache", "seizure", "numbness", "tremor", "memory problems"] },
  { code: "neurosurgery", name: "Neurosurgery", aliases: ["neurosurgery", "neurosurgeon"], symptoms: ["brain surgery consultation", "spine surgery consultation", "nerve compression", "brain tumor surgery", "spinal cord compression"] },
  { code: "orthopedic-surgery", name: "Orthopedic Surgery", aliases: ["orthopedic surgery", "orthopaedic surgery", "orthopedics", "orthopaedics"], symptoms: ["joint pain", "leg pain", "fracture", "back pain", "sports injury"] },
  { code: "general-surgery", name: "General Surgery", aliases: ["general surgery", "general surgeon"], symptoms: ["hernia", "gallbladder problem", "appendix problem", "abdominal lump", "surgical wound"] },
  { code: "plastic-surgery", name: "Plastic Surgery", aliases: ["plastic surgery", "plastic surgeon", "reconstructive surgery"], symptoms: ["burn reconstruction", "scar revision", "hand reconstruction", "complex wound", "facial reconstruction"] },
  { code: "vascular-surgery", name: "Vascular Surgery", aliases: ["vascular surgery", "vascular surgeon"], symptoms: ["varicose veins", "poor circulation", "leg ulcer", "arterial blockage", "carotid disease"] },
  { code: "thoracic-surgery", name: "Thoracic Surgery", aliases: ["thoracic surgery", "thoracic surgeon", "chest surgery"], symptoms: ["lung surgery consultation", "chest wall mass", "mediastinal mass", "esophageal surgery", "pleural disease"] },
  { code: "cardiac-surgery", name: "Cardiac Surgery", aliases: ["cardiac surgery", "heart surgery", "cardiothoracic surgery"], symptoms: ["bypass surgery consultation", "heart valve surgery", "aortic surgery", "congenital heart surgery", "post cardiac surgery review"] },
  { code: "gastroenterology", name: "Gastroenterology", aliases: ["gastroenterology", "gastroenterologist", "digestive clinic"], symptoms: ["abdominal pain", "acid reflux", "diarrhea", "constipation", "difficulty swallowing"] },
  { code: "hepatology", name: "Hepatology", aliases: ["hepatology", "hepatologist", "liver clinic"], symptoms: ["jaundice", "hepatitis", "fatty liver", "cirrhosis", "abnormal liver tests"] },
  { code: "pulmonology", name: "Pulmonology", aliases: ["pulmonology", "pulmonologist", "respiratory medicine", "lung clinic"], symptoms: ["chronic cough", "wheezing", "shortness of breath", "sleep apnea", "abnormal lung test"] },
  { code: "nephrology", name: "Nephrology", aliases: ["nephrology", "nephrologist", "kidney clinic"], symptoms: ["chronic kidney disease", "abnormal creatinine", "protein in urine", "dialysis care", "electrolyte problem"] },
  { code: "urology", name: "Urology", aliases: ["urology", "urologist"], symptoms: ["urinary difficulty", "kidney stones", "prostate problem", "blood in urine", "bladder problem"] },
  { code: "endocrinology", name: "Endocrinology", aliases: ["endocrinology", "endocrinologist", "hormone clinic"], symptoms: ["diabetes", "thyroid problem", "hormone disorder", "adrenal problem", "metabolic disorder"] },
  { code: "rheumatology", name: "Rheumatology", aliases: ["rheumatology", "rheumatologist"], symptoms: ["joint stiffness", "autoimmune disease", "lupus", "inflammatory arthritis", "vasculitis"] },
  { code: "hematology", name: "Hematology", aliases: ["hematology", "haematology", "hematologist"], symptoms: ["anemia", "bleeding disorder", "clotting disorder", "abnormal blood count", "bone marrow problem"] },
  { code: "oncology", name: "Oncology", aliases: ["oncology", "oncologist", "cancer clinic"], symptoms: ["cancer evaluation", "chemotherapy consultation", "tumor follow-up", "cancer survivorship", "new cancer diagnosis"] },
  { code: "dermatology", name: "Dermatology", aliases: ["dermatology", "dermatologist", "skin clinic"], symptoms: ["skin rash", "acne", "changing mole", "skin lesion", "eczema"] },
  { code: "ophthalmology", name: "Ophthalmology", aliases: ["ophthalmology", "ophthalmologist", "eye clinic"], symptoms: ["vision changes", "eye pain", "cataract", "glaucoma", "retina problem"] },
  { code: "ent", name: "ENT (Otolaryngology)", aliases: ["ent", "otolaryngology", "otolaryngologist", "ear nose throat"], symptoms: ["ear pain", "hearing loss", "sinus problem", "tonsil problem", "voice change"] },
  { code: "gynecology", name: "Gynecology", aliases: ["gynecology", "gynaecology", "gynecologist", "gynaecologist"], symptoms: ["menstrual problem", "pelvic pain", "cervical screening", "menopause", "ovarian cyst"] },
  { code: "obstetrics", name: "Obstetrics", aliases: ["obstetrics", "obstetrician", "maternity clinic", "prenatal clinic"], symptoms: ["pregnancy care", "prenatal visit", "high risk pregnancy", "postpartum review", "pregnancy complication"] },
  { code: "pediatrics", name: "Pediatrics", aliases: ["pediatrics", "paediatrics", "pediatrician", "paediatrician", "children's clinic"], symptoms: ["child fever", "growth concern", "child vaccination", "child illness", "developmental concern"] },
  { code: "psychiatry", name: "Psychiatry", aliases: ["psychiatry", "psychiatrist", "mental health clinic"], symptoms: ["depression", "anxiety", "psychosis", "mood changes", "sleep and mood problem"] },
  { code: "infectious-disease", name: "Infectious Disease", aliases: ["infectious disease", "infection specialist"], symptoms: ["persistent fever", "complex infection", "travel infection", "hiv care", "recurrent infection"] },
  { code: "allergy-immunology", name: "Allergy & Immunology", aliases: ["allergy and immunology", "allergy immunology", "allergist", "immunologist"], symptoms: ["seasonal allergy", "food allergy", "immune deficiency", "recurrent allergy", "hives"] },
  { code: "radiology", name: "Radiology", aliases: ["radiology", "radiologist", "diagnostic imaging"], symptoms: ["x-ray appointment", "ct scan", "mri scan", "ultrasound", "imaging-guided procedure"] },
  { code: "nuclear-medicine", name: "Nuclear Medicine", aliases: ["nuclear medicine", "pet scan", "radionuclide imaging"], symptoms: ["pet scan appointment", "thyroid uptake scan", "bone scan", "radionuclide therapy", "nuclear imaging"] },
  { code: "pathology", name: "Pathology", aliases: ["pathology", "pathologist", "laboratory pathology"], symptoms: ["biopsy review", "tissue diagnosis", "pathology second opinion", "laboratory tissue test", "cytology review"] },
  { code: "anesthesiology", name: "Anesthesiology", aliases: ["anesthesiology", "anaesthesiology", "anesthesiologist", "anaesthesiologist"], symptoms: ["preoperative anesthesia review", "sedation planning", "anesthesia complication review", "airway assessment", "perioperative assessment"] },
  { code: "pain-medicine", name: "Pain Medicine", aliases: ["pain medicine", "pain clinic", "pain specialist"], symptoms: ["chronic pain", "nerve pain", "complex regional pain", "back pain procedure", "cancer pain"] },
  { code: "rehabilitation-medicine", name: "Rehabilitation Medicine", aliases: ["rehabilitation medicine", "physical medicine and rehabilitation", "physiatry"], symptoms: ["stroke recovery", "injury rehabilitation", "mobility problem", "functional impairment", "prosthetic rehabilitation"] },
  { code: "sports-medicine", name: "Sports Medicine", aliases: ["sports medicine", "sports physician"], symptoms: ["sports injury", "overuse injury", "return to sport", "exercise-related pain", "concussion follow-up"] },
  { code: "critical-care-medicine", name: "Critical Care Medicine", aliases: ["critical care medicine", "intensive care", "icu", "intensivist"], symptoms: ["organ support", "severe illness", "ventilator care", "post intensive care review", "critical illness recovery"] },
  { code: "geriatrics", name: "Geriatrics", aliases: ["geriatrics", "geriatrician", "older adult clinic"], symptoms: ["frailty", "falls", "memory decline", "multiple medications", "older adult assessment"] },
  { code: "palliative-care", name: "Palliative Care", aliases: ["palliative care", "supportive care"], symptoms: ["advanced illness support", "symptom support", "goals of care", "caregiver support", "serious illness planning"] },
  { code: "medical-genetics", name: "Medical Genetics", aliases: ["medical genetics", "clinical genetics", "geneticist", "genetic counseling"], symptoms: ["inherited condition", "family history of genetic disease", "genetic test counseling", "congenital condition", "rare disease evaluation"] },
  { code: "preventive-medicine", name: "Preventive Medicine", aliases: ["preventive medicine", "preventative medicine", "preventive health"], symptoms: ["health screening", "vaccination planning", "risk assessment", "lifestyle prevention", "occupational health screening"] },
];

const FIRST_NAMES = [
  "Aarav", "Aisha", "Amelia", "Daniel", "Elena", "Elias", "Fatima", "Gabriel", "Hana",
  "Ibrahim", "Julia", "Kenji", "Leila", "Mateo", "Nadia", "Oliver", "Priya", "Samuel",
];
const LAST_NAMES = ["Adler", "Bennett", "Chen", "Dubois", "Garcia", "Hassan", "Ivanov", "Johansson"];

function generatedDoctor(index: number) {
  const first = FIRST_NAMES[index % FIRST_NAMES.length];
  const last = LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length];
  return `Dr. ${first} ${last}`;
}

export const HOSPITAL_DEPARTMENTS: HospitalDepartment[] = DEPARTMENT_SEEDS.map((department, departmentIndex) => {
  const doctors = [0, 1, 2].map((slot) => generatedDoctor(departmentIndex * 3 + slot));
  return { ...department, doctors };
});

const allDoctorNames = HOSPITAL_DEPARTMENTS.flatMap((department) => department.doctors);
if (
  HOSPITAL_DEPARTMENTS.some((department) => department.doctors.length !== 3) ||
  new Set(allDoctorNames).size !== allDoctorNames.length
) {
  throw new Error("Hospital catalog requires exactly three globally unique doctors per department.");
}

export function departmentByCode(code: string) {
  return HOSPITAL_DEPARTMENTS.find((department) => department.code === code);
}
