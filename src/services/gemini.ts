export interface ParsedEvent {
  title: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:mm (24h)
  end: string; // HH:mm (24h)
  location?: string;
  notes?: string;
  category?: string;
}

export interface AnalysisResponse {
  events: ParsedEvent[];
  modelUsed: string;
}

export interface SampleImageInfo {
  id: string;
  title: string;
  description: string;
  filename: string;
  url: string;
}

export async function analyzeScheduleFromImage(
  base64Image: string,
  mimeType: string = 'image/jpeg'
): Promise<AnalysisResponse> {
  const response = await fetch('/api/analyze-schedule', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ base64Image, mimeType }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Server error (${response.status})`);
  }

  return await response.json();
}

export async function analyzeSampleImage(sampleId: string): Promise<AnalysisResponse & { sample: SampleImageInfo }> {
  const response = await fetch('/api/analyze-sample-image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sampleId }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Server error (${response.status})`);
  }

  return await response.json();
}

export async function getSampleImages(): Promise<SampleImageInfo[]> {
  try {
    const response = await fetch('/api/sample-images');
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
}
