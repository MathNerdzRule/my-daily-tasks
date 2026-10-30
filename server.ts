import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '30mb' }));

// Initialize Google Gen AI with server-side API Key
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || undefined,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

/**
 * Helper to call Gemini models with preference for gemini-3.8-flash,
 * falling back to gemini-2.5-flash if needed.
 */
async function generateScheduleAnalysis(cleanBase64: string, mimeType: string, nowStr: string) {
  const prompt = `
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

  const modelsToTry = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview'];
  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      console.log(`[ScheduleLens] Attempting schedule analysis using ${model}...`);
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType: mimeType || 'image/jpeg',
            },
          },
          prompt,
        ],
        config: {
          responseMimeType: 'application/json',
        },
      });

      const responseText = response.text || '';
      const cleanJson = responseText.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      return { events: parsed, modelUsed: model };
    } catch (err: any) {
      console.warn(`[ScheduleLens] Model ${model} failed, trying next fallback:`, err?.message || err);
      lastError = err;
    }
  }

  throw lastError;
}

// Sample images metadata
const SAMPLE_IMAGES = [
  {
    id: 'week-schedule',
    title: 'Weekly Calendar (Oct 26–30, 2026)',
    description: 'Outlook multi-day calendar view with afternoon meetings',
    filename: 'PXL_20261030_171950428_ce68bb1e.jpg',
    url: '/assets/aistudio/PXL_20261030_171950428_ce68bb1e.jpg',
  },
  {
    id: 'single-event',
    title: 'Single Event (Hannah <> Steve)',
    description: 'Close-up timestamp: Fri 10/30/2026 2:30 PM - 3:00 PM',
    filename: 'PXL_20261030_171932152.MACRO_FOCUS.MP_cabc3313.jpg',
    url: '/assets/aistudio/PXL_20261030_171932152.MACRO_FOCUS.MP_cabc3313.jpg',
  },
];

// List available sample images
app.get('/api/sample-images', (_req: Request, res: Response) => {
  return res.json(SAMPLE_IMAGES);
});

// Analyze uploaded base64 image
app.post('/api/analyze-schedule', async (req: Request, res: Response) => {
  try {
    const { base64Image, mimeType = 'image/jpeg' } = req.body;
    if (!base64Image) {
      return res.status(400).json({ error: 'base64Image is required' });
    }

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

    const result = await generateScheduleAnalysis(cleanBase64, mimeType, nowStr);
    return res.json(result);
  } catch (error: any) {
    console.error('Error analyzing schedule image:', error);
    return res.status(500).json({ error: error.message || 'Failed to analyze schedule image' });
  }
});

// Analyze sample image directly on server
app.post('/api/analyze-sample-image', async (req: Request, res: Response) => {
  try {
    const { sampleId } = req.body;
    const sample = SAMPLE_IMAGES.find(s => s.id === sampleId);
    if (!sample) {
      return res.status(404).json({ error: 'Sample image not found' });
    }

    const filePath = path.resolve(__dirname, 'public', 'assets', 'aistudio', sample.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Sample image file not found on disk' });
    }

    const fileBuffer = await fs.promises.readFile(filePath);
    const cleanBase64 = fileBuffer.toString('base64');

    const nowStr = new Date().toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const result = await generateScheduleAnalysis(cleanBase64, 'image/jpeg', nowStr);
    return res.json({ ...result, sample });
  } catch (error: any) {
    console.error('Error analyzing sample image:', error);
    return res.status(500).json({ error: error.message || 'Failed to analyze sample image' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`[ScheduleLens] Server running at http://0.0.0.0:${port}`);
  });
}

startServer();
