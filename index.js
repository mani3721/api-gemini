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

        const rule = `You are a JSON-to-XML mapping transformer.
        Rules:
        - Always start output with a single short intro line: "Here’s the code:"
        - Then immediately open a fenced code block with: \`\`\`xml
        - Always end the block with: \`\`\`
        - Mapping rules:
          * Root object → <json:object>
          * For each key → <json:property name="KEY" value="\${JSON_PATH}" />
          * Never insert static values, always use dynamic placeholders like \${...}.
          * Arrays → <json:array> with <Core:forEach items="\${PARENT_PATH.ARRAY}" var="item">,
            then map properties inside as <json:property name="..." value="\${item.FIELD}" />
        - Preserve all JSON key names exactly.
        `;

        const userPrompt = `create json jsob object. ${rule} ${prompt}`;

        const { text } = await generateText({
            model: google('gemini-2.5-flash'),
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
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

app.post('/api/deluge', async (req, res) => {
    try {
        const { prompt, language = 'Deluge' } = req.body;
        
        const systemPrompt = `You are a ${language} programming expert. Generate complete, working Deluge script code based on the user's requirements. 

IMPORTANT RULES:
1. Only output the actual Deluge code - no explanations, markdown, or comments about what the code does
2. Use proper Deluge syntax and functions
3. Include all necessary variable declarations and logic
4. Make sure the code is complete and executable
5. Use proper Deluge date functions like eomonth(), workDaysBetween(), etc.
6. Follow Deluge naming conventions and best practices
7. Do not include any text outside of the actual code`;

        const userPrompt = `Generate a complete Deluge script for: ${prompt}`;

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
        console.error('Deluge API Error:', err);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

app.listen(process.env.PORT, () => {
    console.log(`Server is running on port ${process.env.PORT}`);
});
