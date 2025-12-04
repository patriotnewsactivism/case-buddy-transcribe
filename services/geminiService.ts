import { GoogleGenAI } from "@google/genai";

const getAiClient = () => {
  // The API key must be obtained exclusively from the environment variable process.env.API_KEY.
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const summarizeText = async (text: string): Promise<string> => {
  if (!text) return "";
  const ai = getAiClient();
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Please summarize the following text concisely:\n\n${text}`,
    });
    return response.text || "";
  } catch (error) {
    console.error("Summarization error:", error);
    throw error;
  }
};

export const translateText = async (text: string, targetLanguage: string): Promise<string> => {
  if (!text) return "";
  const ai = getAiClient();

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Translate the following text to ${targetLanguage}:\n\n${text}`,
    });
    return response.text || "";
  } catch (error) {
    console.error("Translation error:", error);
    throw error;
  }
};