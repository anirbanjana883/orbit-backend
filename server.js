import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { exec } from "child_process";
import { promisify } from "util";
import fs from 'fs/promises';

dotenv.config();

const asyncExecute = promisify(exec);

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  console.error("❌ Error: OPENROUTER_API_KEY environment variable is not set. Please ensure it's in your .env file.");
  process.exit(1);
}

async function executeCommand({ command }) {
  try {
    const { stdout, stderr } = await asyncExecute(command);
    if (stderr) {
      return `❌ Warning/Error: ${stderr}`;
    }
    return `✅ Success: ${stdout || 'Command executed successfully.'}`;
  } catch (error) {
    return `❌ Error: ${error.message}`;
  }
}

async function writeFileContent({ filePath, content }) {
  try {
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    if (dir) {
      await fs.mkdir(dir, { recursive: true });
    }
    await fs.writeFile(filePath, content);
    return `✅ File "${filePath}" written successfully.`;
  } catch (err) {
    return `❌ Error writing to "${filePath}": ${err.message}`;
  }
}

async function generateWebsiteWithDeepSeek(userProblem) {
    const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
    const MODEL_NAME = "deepseek/deepseek-chat";

    const systemInstruction = `You are an elite, production-ready web development AI. Your mission is to craft high-quality, professional frontend code (HTML, CSS, and JavaScript) based on detailed user prompts.

For multi-page website requests, you will generate a SINGLE HTML file. This HTML file must contain all distinct "pages" as clearly defined <section> elements, each with a unique ID (e.g., <section id="home-page">, <section id="about-page">). Implement client-side navigation between these sections using clean, efficient JavaScript to show/hide the appropriate sections, simulating a seamless multi-page experience without full page reloads.

Your generated code must adhere to modern web standards:
- HTML: Semantic, well-structured, and accessible.
- CSS: Responsive (using media queries, flexbox, or grid), clean, and visually appealing based on the theme. Avoid inline styles where possible.
- JavaScript: Modular, efficient, and interactive as per the prompt.

CRITICAL: Your entire response MUST be a single JSON object wrapped in triple backticks, like this:
\`\`\`json
{
  "html": "<!-- FULL HTML CODE HERE, ESCAPED DOUBLE QUOTES -->",
  "css": "/* FULL CSS CODE HERE, ESCAPED DOUBLE QUOTES */",
  "js": "// FULL JAVASCRIPT CODE HERE, ESCAPED DOUBLE QUOTES"
}
\`\`\`
- The JSON object must contain "html", "css", and "js" keys.
- Provide the FULL content for each file type as a single string value.
- Ensure ALL double quotes within the HTML, CSS, and JS content are properly escaped (e.g., use \\" instead of ").
- DO NOT include any conversational text, explanations, or additional markdown outside of the \`\`\`json...\`\`\` block. Only the JSON.
`;

    try {
        const response = await fetch(OPENROUTER_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://spectacular-hotteok-7139fa.netlify.app',
                'X-Title': 'Orbit Website Builder Backend'
            },
            body: JSON.stringify({
                model: MODEL_NAME,
                messages: [
                    { role: 'system', content: systemInstruction },
                    { role: 'user', content: userProblem }
                ],
                temperature: 0.5, // Adjusted for stricter adherence to format
                max_tokens: 3000,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`DeepSeek API error (${response.status}): ${JSON.stringify(errorData)}`);
        }

        const data = await response.json();
        const rawContent = data.choices[0].message.content;

        const jsonMatch = rawContent.match(/```json\n([\s\S]*?)\n```/);

        if (jsonMatch && jsonMatch[1]) {
            let parsedOutput;
            try {
                parsedOutput = JSON.parse(jsonMatch[1]);
                const htmlContent = parsedOutput.html || '';
                const cssContent = parsedOutput.css || '';
                const jsContent = parsedOutput.js || '';

                const folderName = userProblem.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-*|-*$/g, '') || 'generated-website';
                const projectPath = `./generated_websites/${folderName}`;

                await executeCommand({ command: `mkdir ${projectPath}` });

                await writeFileContent({ filePath: `${projectPath}/index.html`, content: htmlContent });

                await writeFileContent({ filePath: `${projectPath}/style.css`, content: cssContent });

                if (jsContent) {
                    await writeFileContent({ filePath: `${projectPath}/script.js`, content: jsContent });
                }

                return {
                    status: "success",
                    message: "Website code generated and files created successfully!",
                    html: htmlContent,
                    css: cssContent,
                    js: jsContent
                };

            } catch (jsonParseError) {
                return { status: "error", message: `AI response format error: Could not parse JSON from model. Raw content: ${rawContent.substring(0, 200)}...` };
            }
        } else {
            return { status: "error", message: `AI response format error: JSON block not found in model's output. Raw content: ${rawContent.substring(0, 200)}...` };
        }

    } catch (error) {
        return { status: "error", message: `Error during AI generation: ${error.message}` };
    }
}

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  'http://localhost:5173',
  'https://spectacular-hotteok-7139fa.netlify.app'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

app.post('/generate-website', async (req, res) => {
    const { prompt, theme } = req.body;

    if (!prompt) {
        return res.status(400).json({ status: "error", message: "Prompt is required." });
    }

    const userProblem = `Create a website for the following description: "${prompt}". Use a "${theme}" theme. Ensure all necessary HTML, CSS, and JavaScript code is provided in the final structured JSON response.`;

    try {
        const result = await generateWebsiteWithDeepSeek(userProblem);
        res.json(result);
    } catch (error) {
        res.status(500).json({ status: "error", message: `Failed to process website generation request: ${error.message}` });
    }
});

app.get('/', (req, res) => {
    res.send('Orbit Backend API is running!');
});

app.listen(PORT, () => {
});
