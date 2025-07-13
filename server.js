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

You must output the code in a structured JSON format. For each file type (html, css, js), provide the full content. If a file type is not explicitly needed or implied by the prompt, its content should be an empty string.

Example of the expected JSON output format for a multi-page site:
\`\`\`json
{
  "html": "<!DOCTYPE html>\\n<html lang=\\"en\\">\\n<head>\\n  <meta charset=\\"UTF-8\\">\\n  <meta name=\\"viewport\\" content=\\"width=device-width, initial-scale=1.0\\">\\n  <title>Dynamic Multi-Page Site</title>\\n  <link rel=\\"stylesheet\\" href=\\"style.css\\">\\n</head>\\n<body>\\n  <header>\\n    <nav>\\n      <button onclick=\\"navigateTo('home-page')\\">Home</button>\\n      <button onclick=\\"navigateTo('about-page')\\">About</button>\\n      <button onclick=\\"navigateTo('contact-page')\\">Contact</button>\\n    </nav>\\n  </header>\\n\\n  <main>\\n    <section id=\\"home-page\\" class=\\"page\\">\\n      <h1>Welcome to Our Site!</h1>\\n      <p>This is the home page content.</p>\\n    </section>\\n\\n    <section id=\\"about-page\\" class=\\"page\\" style=\\"display:none;\\">\\n      <h2>About Us</h2>\\n      <p>Learn more about our mission.</p>\\n    </section>\\n\\n    <section id=\\"contact-page\\" class=\\"page\\" style=\\"display:none;\\">\\n      <h3>Contact Us</h3>\\n      <form>\\n        <input type=\\"text\\" placeholder=\\"Your Name\\">\\n        <button type=\\"submit\\">Send</button>\\n      </form>\\n    </section>\\n  </main>\\n\\n  <script src=\\"script.js\\"></script>\\n</body>\\n</html>",
  "css": "body {\\n  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;\\n  margin: 0;\\n  padding: 0;\\n  background-color: #1a1a2e;\\n  color: #e0e0e0;\\n}\\n\\nheader {\\n  background-color: #2a2a4e;\\n  padding: 15px 20px;\\n  box-shadow: 0 2px 5px rgba(0,0,0,0.2);\\n}\\n\\nnav button {\\n  background: none;\\n  border: none;\\n  color: #88f;\\n  font-size: 18px;\\n  margin-right: 20px;\\n  cursor: pointer;\\n  transition: color 0.3s ease;\\n}\\n\\nnav button:hover {\\n  color: #fff;\\n}\\n\\nmain {\\n  padding: 20px;\\n}\\n\\n.page {\\n  padding: 30px;\\n  background-color: #2a2a4e;\\n  border-radius: 8px;\\n  margin-bottom: 20px;\\n}\\n\\nh1, h2, h3 {\\n  color: #99f;\\n}\\n\\n@media (max-width: 768px) {\\n  nav {\\n    display: flex;\\n    flex-direction: column;\\n    align-items: center;\\n  }\\n  nav button {\\n    margin: 5px 0;\\n  }\\n}",
  "js": "function navigateTo(pageId) {\\n  document.querySelectorAll('.page').forEach(page => {\\n    page.style.display = 'none';\\n  });\\n  document.getElementById(pageId).style.display = 'block';\\n\\n  const url = new URL(window.location);\\n  url.hash = pageId;\\n  window.history.pushState({}, '', url);\\n}\\n\\ndocument.addEventListener(\\"DOMContentLoaded\\", () => {\\n  const initialPage = window.location.hash ? window.location.hash.substring(1) : 'home-page';\\n  navigateTo(initialPage);\\n});\\n\\nwindow.addEventListener('popstate', () => {\\n  const pageFromHash = window.location.hash ? window.location.hash.substring(1) : 'home-page';\\n  navigateTo(pageFromHash);\\n});"
}
\`\`\`

Crucial Rules:
- ALWAYS wrap your final JSON output in triple backticks (e.g., \`\`\`json{...}\`\`\`).
- ONLY output the JSON structure within the triple backticks. Do NOT include any conversational text or explanation outside of it.
- Ensure all double quotes within the JSON content are properly escaped (\\").
- Provide the FULL content for each file type.`;

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
                temperature: 0.7,
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
