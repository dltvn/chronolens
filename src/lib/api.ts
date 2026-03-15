export type GenderWithCropResponse = {
  gender: "male" | "female";
  confidence: number;
  prob_female: number;
  prob_male: number;
  cropped_image_base64: string;
  cropped_image_mime_type: string;
};

export type AgeAgnosticWithCropResponse = {
  predicted_age: number;
  confidence: number;
  distribution: number[];
  cropped_image_base64: string;
  cropped_image_mime_type: string;
};

export type GenderSpecificWithCropResponse = {
  gender: "male" | "female";
  gender_confidence: number;
  predicted_age: number;
  confidence: number;
  distribution: number[];
  cropped_image_base64: string;
  cropped_image_mime_type: string;
};

export type RaceWithCropResponse = {
  race: string;
  confidence: number;
  probabilities: Record<string, number>;
  cropped_image_base64: string;
  cropped_image_mime_type: string;
};

const DEFAULT_API_BASE = "http://127.0.0.1:8000/api";
const API_BASE = (import.meta.env.VITE_API_BASE ?? DEFAULT_API_BASE).replace(
  /\/$/,
  ""
);

async function postImage<T>(endpoint: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export function predictGenderWithCrop(file: File) {
  return postImage<GenderWithCropResponse>("/predict/gender-with-crop", file);
}

export function predictAgeAgnosticWithCrop(file: File) {
  return postImage<AgeAgnosticWithCropResponse>(
    "/predict/age-agnostic-with-crop",
    file
  );
}

export function predictAgeGenderSpecificWithCrop(file: File) {
  return postImage<GenderSpecificWithCropResponse>(
    "/predict/age-gender-specific-with-crop",
    file
  );
}

export function predictRaceWithCrop(file: File) {
  return postImage<RaceWithCropResponse>("/predict/race-with-crop", file);
}
