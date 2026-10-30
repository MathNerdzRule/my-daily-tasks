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

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
const MODELS_TO_TRY = ['gemini-3-flash-preview', 'gemini-3.8-flash', 'gemini-3.1-flash-lite'];
const MODEL_TIMEOUT_MS = 45000;

function buildSchedulePrompt(nowStr: string): string {
  return `
You are a precise calendar and schedule parser assistant.
Current Date & Time context: ${nowStr}.

The user took a photo of their computer screen displaying their calendar. There are two primary scenarios:

SCENARIO 1: SINGLE EVENT DETAIL / MACRO FOCUS (e.g., meeting invite banner, appointment header)
- Displays a title like "Hannah<>Steve"
- Displays an explicit timestamp string like "Fri 10/30/2026 2:30 PM - 3:00 PM"
- May mention meeting details like "Microsoft Teams Meeting"
- Extract this exact single event with the precise start, end, and date.

SCENARIO 2: WEEK CALENDAR GRID / PARTIAL DAY SCHEDULE
- Shows a weekly calendar (e.g. Outlook) with date columns such as "26 Mon", "27 Tue", "28 Wed", "29 Thu", "30 Fri", with a header like "October 26-30, 2026".
- Shows an hourly time axis on the left (e.g. 2 PM, 3 PM, 4 PM, 5 PM, 6 PM, 7 PM).
- Note: Due to screen resolution, only about half the day (e.g. afternoon or morning) may be visible in a single photo.
- May contain tooltips like "FW: AIE Architecture Review Board - Weekly 3:30 PM to 4:30 PM".
- Extract EVERY visible event block on the schedule.
- Determine the event's date (YYYY-MM-DD) by aligning the column to the corresponding header date.
- Determine the event's start time and end time in 24-hour "HH:mm" format by referencing the left hour axis or tooltip text.
- If duration is not clear, default to 30 or 60 minutes based on block height.
- CRITICAL: IGNORE any blocks for "Out of Office", "OOO", "PTO", or "DTO".
- Clean up titles by removing unnecessary system text, but keep meaningful prefixes or meeting names (e.g. "FW: Internal Defect Triage", "Break KT Session", "AIE Architecture Review Board").

Return ONLY a JSON array of objects with the following schema:
[
  {
    "title": "Clear event title",
    "date": "YYYY-MM-DD",
    "start": "HH:mm",
    "end": "HH:mm",
    "location": "e.g. Microsoft Teams or room if visible, else empty string",
    "notes": "Organizer, team, or extra details if visible",
    "category": "Work" | "Meeting" | "Personal" | "Health" | "Other"
  }
]
`;
}

async function analyzeScheduleOnDevice(base64Image: string, mimeType: string): Promise<AnalysisResponse> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const cleanBase64 = base64Image.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
  const nowStr = new Date().toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const prompt = buildSchedulePrompt(nowStr);
  let lastError: unknown = null;
  for (const model of MODELS_TO_TRY) {
    try {
      const response = await Promise.race([
        ai.models.generateContent({
          model,
          contents: [{ inlineData: { data: cleanBase64, mimeType } }, prompt],
          config: { responseMimeType: 'application/json' },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`${model} timed out after ${MODEL_TIMEOUT_MS / 1000}s`)), MODEL_TIMEOUT_MS)
        ),
      ]);
      const cleanJson = (response.text || '').replace(/```json|```/g, '').trim();
      return { events: JSON.parse(cleanJson), modelUsed: model };
    } catch (err) {
      console.warn(`Model ${model} failed, trying next fallback:`, err);
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Schedule analysis failed');
}

export async function analyzeScheduleFromImage(
  base64Image: string,
  mimeType: string = 'image/jpeg'
): Promise<AnalysisResponse> {
  if (API_KEY) return analyzeScheduleOnDevice(base64Image, mimeType);

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
