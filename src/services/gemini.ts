import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(API_KEY);

export async function parseTask(query: string) {
  if (!API_KEY) throw new Error("API Key missing");

  const model = genAI.getGenerativeModel(
    { model: "gemini-3-flash-preview" },
    { apiVersion: "v1beta" },
  );
  const prompt = `
    Current Date/Time: ${new Date().toLocaleString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}
    Parse this user task input into a JSON object: "${query}"
    Use this structure:
    {
      "title": "Task title",
      "start": "HH:mm" (24h format),
      "end": "HH:mm" (24h format),
      "category": "Work" | "Personal" | "Health" | "Urgent" | "Leisure",
      "priority": 1 | 2 | 3,
      "date": "yyyy-MM-dd" (infer from query relative to current date, default to today),
      "recurring": {
        "type": "none" | "daily" | "weekdays" | "custom" | "weekly" | "monthly" | "monthly_weekday",
        "days": [0,1,2,3,4,5,6] (required if type is custom, weekly, or monthly_weekday. 0 is Sunday),
        "nth": 1|2|3|4|5 (required if type is monthly_weekday, e.g. 1 for first Friday, 2 for second...)
      }
    }
    If the user mentions "every day" or "daily", use type "daily".
    If they mention "weekdays" or "mon-fri", use type "weekdays".
    If they specify "every Monday", use type "custom" and days [1].
    If they specify "15th of every month", use type "monthly".
    If they specify "first Friday of every month", use type "monthly_weekday", days: [5], nth: 1.
    If duration isn't specified, default to 1 hour.
    Return ONLY the JSON.
  `;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  const cleanJson = responseText.replace(/```json|```/g, "").trim();
  return JSON.parse(cleanJson);
}

export async function analyzeScheduleFromImage(base64Image: string) {
  if (!API_KEY) throw new Error("API Key missing");

  const model = genAI.getGenerativeModel(
    { model: "gemini-3-flash-preview" },
    { apiVersion: "v1beta" },
  );

  const prompt = `
    Current Date/Time: ${new Date().toLocaleString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}
    Analyze this image of a schedule or calendar. 
    Extract all visible tasks and return them as a JSON array of objects with this structure:
    {
      "title": "Task title",
      "start": "HH:mm" (24h format),
      "end": "HH:mm" (24h format),
      "date": "yyyy-MM-dd" (EXTRACT THE ACTUAL DATE FOR EACH EVENT FROM THE IMAGE),
      "category": "Work" | "Personal" | "Health" | "Urgent" | "Leisure" (infer from context),
      "priority": 2
    }
    CRITICAL: IGNORE any calendar entries that are for "Out of Office", "OOO", "PTO", or "DTO". 
    Return ONLY the JSON array.
  `;

  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        data: base64Image,
        mimeType: "image/jpeg",
      },
    },
  ]);

  const responseText = result.response.text();
  const cleanJson = responseText.replace(/```json|```/g, "").trim();
  return JSON.parse(cleanJson);
}
