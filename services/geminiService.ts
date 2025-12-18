import { GoogleGenAI } from "@google/genai";

const getClient = () => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        throw new Error("API Key not found");
    }
    return new GoogleGenAI({ apiKey });
};

export const generateCollageDescription = async (base64Image: string): Promise<string> => {
    try {
        const ai = getClient();
        // Remove data URL prefix if present for Gemini API (though often handled, better safe)
        const cleanBase64 = base64Image.split(',')[1] || base64Image;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    {
                        inlineData: {
                            mimeType: 'image/jpeg',
                            data: cleanBase64
                        }
                    },
                    {
                        text: "This is a photo collage created from a collection of Instagram video memories. Please write a short, nostalgic, and engaging caption for this collage that I can post on social media. Keep it under 50 words. Add a few emojis."
                    }
                ]
            }
        });

        return response.text || "Could not generate caption.";
    } catch (error) {
        console.error("Gemini API Error:", error);
        throw error;
    }
};

export const suggestLayout = async (count: number): Promise<string> => {
    try {
        const ai = getClient();
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `I have ${count} photos I want to arrange in an A4 collage. Suggest a creative layout idea or grid configuration in one short sentence.`,
        });
        return response.text || "";
    } catch (e) {
        return "";
    }
}
