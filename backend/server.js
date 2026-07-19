const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Allow frontend to call this backend
app.use(express.json({ limit: '10mb' })); // Support large image uploads

// Initialize Gemini AI (Using the Key from .env)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Default Route
app.get('/', (req, res) => {
    res.json({ message: "Manee Accounting AI Proxy is running!" });
});

// AI Chat Proxy Route
app.post('/api/chat', async (req, res) => {
    try {
        const { systemInstruction, userMessage, imageBase64, imageMimeType, chatHistory } = req.body;
        
        // Ensure API Key exists
        if (!process.env.GEMINI_API_KEY) {
            return res.status(500).json({ error: "Server missing API Key." });
        }

        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            systemInstruction: systemInstruction 
        });

        // Construct history (Convert to Gemini format)
        // Note: In production, we'd want to manage history properly
        const parts = [];
        
        if (imageBase64 && imageMimeType) {
            parts.push({
                inlineData: {
                    data: imageBase64,
                    mimeType: imageMimeType
                }
            });
        }
        
        parts.push({ text: userMessage });

        // Generate Content
        const result = await model.generateContent(parts);
        const responseText = result.response.text();
        
        res.json({ text: responseText });
        
    } catch (error) {
        console.error("AI Error:", error);
        res.status(500).json({ error: "Failed to communicate with AI.", details: error.message });
    }
});

// Start Server
app.listen(port, () => {
    console.log(`Backend Server listening at http://localhost:${port}`);
});
