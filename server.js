import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv'; // For environment variables
import { exec } from "child_process"; // Still needed for file system operations
import { promisify } from "util";
import fs from 'fs/promises';

// Load environment variables from .env file at the very beginning
dotenv.config();

const asyncExecute = promisify(exec);

// Retrieve your OpenRouter API Key from environment variables
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// --- Debugging check: Confirm API Key is loaded ---
console.log("[BACKEND] OPENROUTER_API_KEY value during init:", OPENROUTER_API_KEY ? "Loaded (key length: " + OPENROUTER_API_KEY.length + ")" : "UNDEFINED");

if (!OPENROUTER_API_KEY) {
  console.error("❌ Error: OPENROUTER_API_KEY environment variable is not set. Please ensure it's in your .env file.");
  process.exit(1); // Exit the process if the API key is missing
}

// --- Tool Definitions (These remain the same as they are local file system operations) ---

async function executeCommand({ command }) {
  try {
    const { stdout, stderr } = await asyncExecute(command);
    if (stderr) {
      console.warn(`[BACKEND] Command stderr for "${command}": ${stderr}`);
      return `❌ Warning/Error: ${stderr}`;
    }
    return `✅ Success: ${stdout || 'Command executed successfully.'}`;
  } catch (error) {
    console.error(`[BACKEND] Error executing command "${command}":`, error);
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
    console.error(`[BACKEND] Error writing to "${filePath}":`, err);
    return `❌ Error writing to "${filePath}": ${err.message}`;
  }
}

// --- Agent Logic for Website Generation (MODIFIED FOR OPENROUTER/DEEPSEEK) ---

// We'll simplify the "agent" loop here because OpenRouter API doesn't directly support
// Gemini's function calling in the same way. We'll ask the model to provide the code
// directly and then parse it.

async function generateWebsiteWithDeepSeek(userProblem) {
    const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
    // Use deepseek/deepseek-chat for general purposes, or deepseek/deepseek-r1 for reasoning tasks.
    // OpenRouter provides free models that are often aliased like this.
    const MODEL_NAME = "deepseek/deepseek-chat"; // This is the recommended free model

    // The prompt needs to guide DeepSeek to output a parseable structure
    const systemInstruction = `You are an expert Website builder. Your goal is to create the frontend code (HTML, CSS, and JavaScript) based on the user's prompt. Provide ALL three files (HTML, CSS, JS) if the user prompt implies dynamic behavior (e.g., a calculator, interactive elements). If the user asks for a static page, then generate only the HTML and CSS.

    You must output the code in a structured JSON format. For each file type (html, css, js), provide the full content. If a file type is not needed, its content should be an empty string.

    Example of the expected JSON output format:
    \`\`\`json
    {
      "html": "<!DOCTYPE html>\\n<html>\\n<head>\\n  <title>My Website</title>\\n  <link rel=\\"stylesheet\\" href=\\"style.css\\">\\n</head>\\n<body>\\n  <h1>Hello World!</h1>\\n  <script src=\\"script.js\\"></script>\\n</body>\\n</html>",
      "css": "body {\\n  font-family: Arial, sans-serif;\\n  background-color: #f0f0f0;\\n}\\nh1 {\\n  color: #333;\\n}",
      "js": "document.addEventListener(\\"DOMContentLoaded\\", () => {\\n  console.log(\\"Website loaded.\\");\\n});"
    }
    \`\`\`

    Crucial Rules:
    - ALWAYS wrap your final JSON output in triple backticks (e.g., \`\`\`json{...}\`\`\`).
    - ONLY output the JSON structure within the triple backticks. Do NOT include any conversational text or explanation outside of it.
    - Ensure all double quotes within the JSON content are properly escaped (\\").
    - Provide the FULL content for each file type.`
    ;

    try {
        const response = await fetch(OPENROUTER_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                // Optional: For OpenRouter leaderboards/analytics
                'HTTP-Referer': 'http://localhost:5173', // Your frontend URL
                'X-Title': 'Orbit Website Builder Backend' // Your app title
            },
            body: JSON.stringify({
                model: MODEL_NAME,
                messages: [
                    { role: 'system', content: systemInstruction },
                    { role: 'user', content: userProblem }
                ],
                temperature: 0.7, // Adjust for creativity vs. consistency
                max_tokens: 3000, // Increase if you need longer responses
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error(`[BACKEND] DeepSeek API Error: Status ${response.status}`, errorData);
            throw new Error(`DeepSeek API error (${response.status}): ${JSON.stringify(errorData)}`);
        }

        const data = await response.json();
        const rawContent = data.choices[0].message.content;
        console.log("[BACKEND] Raw content from DeepSeek:", rawContent);

        // --- Parsing the AI's response to extract JSON ---
        const jsonMatch = rawContent.match(/```json\n([\s\S]*?)\n```/);

        if (jsonMatch && jsonMatch[1]) {
            let parsedOutput;
            try {
                parsedOutput = JSON.parse(jsonMatch[1]);
                // Ensure the keys are present, even if empty strings
                const htmlContent = parsedOutput.html || '';
                const cssContent = parsedOutput.css || '';
                const jsContent = parsedOutput.js || '';

                // --- Execute file operations (This part is still local) ---
                const folderName = userProblem.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-*|-*$/g, '') || 'generated-website';
                const projectPath = `./generated_websites/${folderName}`;

                console.log(`[BACKEND] Creating directory: ${projectPath}`);
                await executeCommand({ command: `mkdir ${projectPath}` });

                // Use touch if you want to create empty files first, then write.
                // For simplicity here, writeFileContent will create parent dirs if needed.
                console.log(`[BACKEND] Writing HTML to ${projectPath}/index.html`);
                await writeFileContent({ filePath: `${projectPath}/index.html`, content: htmlContent });

                console.log(`[BACKEND] Writing CSS to ${projectPath}/style.css`);
                await writeFileContent({ filePath: `${projectPath}/style.css`, content: cssContent });

                if (jsContent) {
                    console.log(`[BACKEND] Writing JS to ${projectPath}/script.js`);
                    await writeFileContent({ filePath: `${projectPath}/script.js`, content: jsContent });
                }

                console.log("[BACKEND] ✅ DeepSeek agent finished generating website and files.");

                return {
                    status: "success",
                    message: "Website code generated and files created successfully!",
                    html: htmlContent,
                    css: cssContent,
                    js: jsContent
                };

            } catch (jsonParseError) {
                console.error("[BACKEND] ❌ Failed to parse JSON from DeepSeek response:", jsonParseError);
                return { status: "error", message: `AI response format error: Could not parse JSON from model. Raw content: ${rawContent.substring(0, 200)}...` };
            }
        } else {
            console.error("[BACKEND] ❌ DeepSeek response did not contain expected JSON block.");
            return { status: "error", message: `AI response format error: JSON block not found in model's output. Raw content: ${rawContent.substring(0, 200)}...` };
        }

    } catch (error) {
        console.error("[BACKEND] ❌ Error during DeepSeek API call or processing:", error);
        return { status: "error", message: `Error during AI generation: ${error.message}` };
    }
}


// --- Express App Setup (Mostly the same) ---
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
    origin: 'http://localhost:5173', // Your frontend URL
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
}));
app.use(express.json());

app.post('/generate-website', async (req, res) => {
    const { prompt, theme } = req.body; // Assuming 'style' is now part of 'theme' or handled in prompt

    if (!prompt) {
        return res.status(400).json({ status: "error", message: "Prompt is required." });
    }

    // Adapt the user's prompt for DeepSeek's single-turn generation
    const userProblem = `Create a website for the following description: "${prompt}". Use a "${theme}" theme. Ensure all necessary HTML, CSS, and JavaScript code is provided in the final structured JSON response.`;
    console.log(`[BACKEND] Received generation request: "${prompt}" (Theme: "${theme}")`);

    try {
        const result = await generateWebsiteWithDeepSeek(userProblem); // Call the new function
        res.json(result);
    } catch (error) {
        console.error("[BACKEND] Uncaught error in /generate-website endpoint:", error);
        res.status(500).json({ status: "error", message: `Failed to process website generation request: ${error.message}` });
    }
});

app.get('/', (req, res) => {
    res.send('Orbit Backend API is running!');
});

app.listen(PORT, () => {
    console.log(`[BACKEND] Server running on http://localhost:${PORT}`);
});