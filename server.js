require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("."));

// Environment Variables Check
const GROQ_API_KEY = process.env.GROQ_API_KEY;
if (!GROQ_API_KEY) {
    console.error('⚠️ CRITICAL: GROQ_API_KEY is not set in environment variables!');
}

/**
 * @api {POST} /api/chat Proxy requests to Groq API securely
 * This hides your Groq API Key from the frontend browser.
 */
app.post('/api/chat', async (req, res) => {
    try {
        const { messages, model, temperature, max_tokens } = req.body;

        if (!GROQ_API_KEY) {
            return res.status(500).json({ error: { message: "Internal Server Error: API Key missing." } });
        }

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model,
                messages,
                temperature: temperature || 0,
                max_tokens: max_tokens || 1024
            })
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        res.json(data);
    } catch (error) {
        console.error('Backend Proxy Error:', error);
        res.status(500).json({ error: { message: "Internal Server Error: Failed to contact AI API." } });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
});
