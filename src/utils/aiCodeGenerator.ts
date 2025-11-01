import * as vscode from "vscode";
import * as https from "https";

interface AIConfig {
  provider: "gemini" | "openai" | "anthropic";
  model: string;
  apiKey: string;
}

/**
 * Get AI configuration from VS Code settings
 */
function getAIConfig(): AIConfig {
  const config = vscode.workspace.getConfiguration("ixdar-vs.ai");
  return {
    provider: config.get<"gemini" | "openai" | "anthropic">(
      "provider",
      "gemini"
    ),
    model: config.get<string>(
      "model",
      [
        "gemini-2.5-pro",
        "gemini-2.0-flash-exp",
        "gemini-2.0-pro",
        "gemini-2.5-pro",
        "gpt-3.5-turbo",
        "gpt-4",
        "gpt-4o",
        "claude-3-haiku-20240307",
        "claude-3-sonnet-20240229",
        "claude-3-opus-20240229",
      ][0]
    ),
    apiKey: config.get<string>("apiKey", ""),
  };
}

/**
 * Make HTTP request
 */
function httpsRequest(
  hostname: string,
  path: string,
  method: string,
  headers: Record<string, string>,
  body: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          ...headers,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(
              new Error(
                `HTTP ${res.statusCode}: ${data || res.statusMessage || "Unknown error"}`
              )
            );
          }
        });
      }
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/**
 * Call Gemini API
 */
async function callGemini(
  prompt: string,
  apiKey: string,
  model: string
): Promise<string> {
  const body = JSON.stringify({
    contents: [
      {
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ],
  });

  const response = await httpsRequest(
    "generativelanguage.googleapis.com",
    `/v1beta/models/${model}:generateContent?key=${apiKey}`,
    "POST",
    {},
    body
  );

  const parsed = JSON.parse(response);
  if (parsed.candidates && parsed.candidates[0]?.content?.parts?.[0]?.text) {
    return parsed.candidates[0].content.parts[0].text;
  }
  throw new Error("Invalid response from Gemini API");
}

/**
 * Call OpenAI API
 */
async function callOpenAI(
  prompt: string,
  apiKey: string,
  model: string
): Promise<string> {
  const body = JSON.stringify({
    model,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const response = await httpsRequest(
    "api.openai.com",
    "/v1/chat/completions",
    "POST",
    {
      Authorization: `Bearer ${apiKey}`,
    },
    body
  );

  const parsed = JSON.parse(response);
  if (parsed.choices && parsed.choices[0]?.message?.content) {
    return parsed.choices[0].message.content;
  }
  throw new Error("Invalid response from OpenAI API");
}

/**
 * Call Anthropic API
 */
async function callAnthropic(
  prompt: string,
  apiKey: string,
  model: string
): Promise<string> {
  const body = JSON.stringify({
    model,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const response = await httpsRequest(
    "api.anthropic.com",
    "/v1/messages",
    "POST",
    {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body
  );

  const parsed = JSON.parse(response);
  if (parsed.content && parsed.content[0]?.text) {
    return parsed.content[0].text;
  }
  throw new Error("Invalid response from Anthropic API");
}

/**
 * Call AI based on configured provider
 */
async function callAI(prompt: string): Promise<string> {
  const config = getAIConfig();

  if (!config.apiKey) {
    throw new Error(
      `API key not configured. Please set ixdar-vs.ai.apiKey in settings.`
    );
  }

  switch (config.provider) {
    case "gemini":
      return await callGemini(prompt, config.apiKey, config.model);
    case "openai":
      return await callOpenAI(prompt, config.apiKey, config.model);
    case "anthropic":
      return await callAnthropic(prompt, config.apiKey, config.model);
    default:
      throw new Error(`Unknown AI provider: ${config.provider}`);
  }
}

/**
 * Clean code response (remove markdown formatting if present)
 */
function cleanCodeResponse(response: string): string {
  let cleaned = response.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[\w]*\n/, "");
    cleaned = cleaned.replace(/\n```$/, "");
  }
  return cleaned.trim();
}

/**
 * Generate low-level command implementation code
 */
export async function generateLowLevelCode(
  description: string
): Promise<string> {
  const prompt = `Generate TypeScript code for a VS Code command function body that does the following:

${description}

Requirements:
- Generate ONLY the code that goes inside the async function body
- Use VS Code API (vscode.window, vscode.workspace, etc.) as needed
- Include proper error handling
- Do NOT include the function declaration itself
- Do NOT include any markdown formatting or code fences
- Return clean, executable TypeScript code

Example format (do not include this structure, only the code inside):
// Your generated code here
const editor = vscode.window.activeTextEditor;
// ... more implementation`;

  const response = await callAI(prompt);
  return cleanCodeResponse(response);
}

/**
 * Generate high-level command orchestration code
 */
export async function generateHighLevelCode(
  description: string,
  commandNames: string[]
): Promise<string> {
  const prompt = `Generate TypeScript code that orchestrates these ixdar-vs commands to accomplish the following task:

Description: ${description}

Available commands to use: ${commandNames.join(", ")}

Requirements:
- Generate ONLY the code that goes inside the async function body
- Import CommandRegistry: const registry = CommandRegistry.getInstance();
- For each command you want to call:
  1. Find it: const cmd = registry.getAll().find(c => c.vscodeCommand.id.endsWith('.commandName'));
  2. Call it: await cmd.mcp.call({ arg1: value1, arg2: value2 });
- Call commands in the correct sequence to achieve the goal
- Include error handling for commands not found
- Do NOT include the function declaration itself
- Do NOT include any markdown formatting or code fences
- Return clean, executable TypeScript code

Example format (do not include this structure, only similar code):
const registry = CommandRegistry.getInstance();
const cmd1 = registry.getAll().find(c => c.vscodeCommand.id.endsWith('.command1'));
if (cmd1) {
  await cmd1.mcp.call({ param: "value" });
}`;

  const response = await callAI(prompt);
  return cleanCodeResponse(response);
}
