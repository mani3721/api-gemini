import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post('/generate/json', async (req, res) => {
    try {
        const { systemPrompt, prompt } = req.body;

        const { text } = await generateText({
            model: google('gemini-2.5-flash'),
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt },
            ],
        });

        res.json({
            success: true,
            data: text
        });

    } catch (err) {
        console.error('Gemini API Error:', err);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});


app.post('/api/rewrite', async (req, res) => {
    try {
        const { code, instructions, language = '' } = req.body;
        const systemPrompt = `You are a ${language ? language + " " : ""}programmer that replaces <FILL_ME> part with the right code. Only output the code that replaces <FILL_ME> part. Do not add any explanation or markdown.`;
        const userPrompt = `${code}<FILL_ME>${instructions}`;

        const { text } = await generateText({
            model: google('gemini-2.5-flash'),
            messages: [
                {
                    role: "system",
                    content: systemPrompt,
                },
                { 
                    role: "user", 
                    content: userPrompt 
                },
            ],
        });

        res.json({
            success: true,
            data: text
        });

    } catch (err) {
        console.error('Rewrite API Error:', err);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

app.listen(process.env.PORT, () => {
    console.log(`Server is running on port ${process.env.PORT}`);
});
