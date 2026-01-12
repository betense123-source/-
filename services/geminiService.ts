import { GoogleGenAI, Type } from "@google/genai";
import { AuditResult, SingleCheckResult } from "../types";

const cleanBase64 = (base64: string) => {
  if (!base64) return "";
  return base64.replace(/^data:image\/[a-z]+;base64,/, "");
};

// Helper to safely get API Key
export const getApiKey = (): string => {
  try {
    // @ts-ignore
    if (typeof process !== 'undefined' && process.env?.API_KEY) {
       // @ts-ignore
       return process.env.API_KEY;
    }
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) {
       // @ts-ignore
       return import.meta.env.VITE_API_KEY;
    }
  } catch (e) {
    console.error("Error reading environment variables", e);
  }
  return "";
};

// --- Check 1: Numeric Amount Check ---
const performAmountCheck = async (
  ai: GoogleGenAI,
  amount: number,
  imageBase64: string | null,
  currencyContext: string
): Promise<SingleCheckResult> => {
  if (!imageBase64) {
    return { verified: false, extractedAmount: null, reason: "No screenshot provided" };
  }

  try {
    const modelId = "gemini-3-flash-preview";
    
    const prompt = `
      You are a strict financial auditor. 
      Analyze this image (screenshot of a transaction).
      1. Identify the principal/total amount. Look for numbers close to ${amount}.
      2. The expected currency context is ${currencyContext}.
      3. Compare the found amount with the user's claimed amount: ${amount}.
      4. Return a JSON object. Matches should be true if the amount is within 0.05 difference.
    `;

    const response = await ai.models.generateContent({
      model: modelId,
      contents: {
        parts: [
          { inlineData: { mimeType: "image/png", data: cleanBase64(imageBase64) } },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            extractedAmount: { type: Type.NUMBER, description: "The numeric amount found" },
            matches: { type: Type.BOOLEAN, description: "True if amounts match" },
            reasoning: { type: Type.STRING, description: "Short explanation" },
          },
          required: ["extractedAmount", "matches", "reasoning"],
        },
      },
    });

    const resultText = response.text;
    if (!resultText) throw new Error("Empty AI response");
    
    const data = JSON.parse(resultText);
    return {
      verified: data.matches,
      extractedAmount: data.extractedAmount,
      reason: data.reasoning,
    };

  } catch (error: any) {
    console.error(`Gemini Error (${currencyContext}):`, error);
    return {
      verified: false,
      extractedAmount: null,
      reason: `AI Error: ${error.message || "Unknown error"}`,
    };
  }
};

// --- Check 2: Text/Order ID Check ---
const performTextCheck = async (
  ai: GoogleGenAI,
  targetText: string,
  imageBase64: string | null,
  contextLabel: string
): Promise<SingleCheckResult> => {
  if (!imageBase64 || !targetText) {
    return { verified: false, extractedAmount: null, reason: "No screenshot or Order ID provided" };
  }

  try {
    const modelId = "gemini-3-flash-preview";
    
    const prompt = `
      You are a strict financial auditor.
      Analyze this image.
      1. Look specifically for the Order ID: "${targetText}".
      2. It might appear in a "Note", "Description", "Order #", or "Transaction ID" field.
      3. Ignore whitespace differences.
      4. Return a JSON object indicating if the Order ID was found.
    `;

    const response = await ai.models.generateContent({
      model: modelId,
      contents: {
        parts: [
          { inlineData: { mimeType: "image/png", data: cleanBase64(imageBase64) } },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            foundText: { type: Type.STRING, description: "The text found that resembles the order ID" },
            matches: { type: Type.BOOLEAN, description: "True if the order ID is found" },
            reasoning: { type: Type.STRING, description: "Where was it found?" },
          },
          required: ["foundText", "matches", "reasoning"],
        },
      },
    });

    const resultText = response.text;
    if (!resultText) throw new Error("Empty AI response");
    
    const data = JSON.parse(resultText);
    return {
      verified: data.matches,
      extractedAmount: null,
      extractedText: data.foundText,
      reason: data.reasoning,
    };

  } catch (error: any) {
    console.error(`Gemini Error (${contextLabel}):`, error);
    return {
      verified: false,
      extractedAmount: null,
      reason: `AI Error: ${error.message || "Unknown error"}`,
    };
  }
};

export const performFullAudit = async (
  amountUSD: number,
  screenshotUSD: string | null,
  amountCNY: number,
  screenshotCNY: string | null,
  orderId: string,
  screenshotOrder: string | null,
  explicitApiKey?: string // NEW: Allow passing key directly
): Promise<AuditResult> => {
  // Use passed key OR environment key
  const apiKey = explicitApiKey || getApiKey();

  // If still no key, return error result gracefully instead of crashing
  if (!apiKey) {
    console.warn("API Key is missing. Check process.env.API_KEY");
    const err = { verified: false, extractedAmount: null, reason: "Missing API Key" };
    return { usdCheck: err, cnyCheck: err, orderCheck: err, timestamp: Date.now() };
  }

  const ai = new GoogleGenAI({ apiKey });

  // Prioritize specific order screenshot, fallback to USD screenshot (which often has order ID in notes)
  const orderTargetImage = screenshotOrder || screenshotUSD;
  const orderContext = screenshotOrder ? "Dedicated Order Screenshot" : "USD Payment Notes";

  const [usdResult, cnyResult, orderResult] = await Promise.all([
    performAmountCheck(ai, amountUSD, screenshotUSD, "USD (PayPal Principal)"),
    performAmountCheck(ai, amountCNY, screenshotCNY, "CNY (Credit Card Deduction)"),
    performTextCheck(ai, orderId, orderTargetImage, `Order ID Check (${orderContext})`) 
  ]);

  return {
    usdCheck: usdResult,
    cnyCheck: cnyResult,
    orderCheck: orderResult,
    timestamp: Date.now(),
  };
};