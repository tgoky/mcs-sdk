/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

// 1. Updated Configuration
const REPO_ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(REPO_ROOT, '.env');

// Focus scanning on business logic, routes, schemas, and background workers
const SCAN_DIRS = [
  path.join(REPO_ROOT, 'src')
];

// OpenRouter model
const MODEL = 'stealth/ox-alph';

// Only bundle TypeScript code files (exclude heavy .json and .css files)
const ALLOWED_EXTENSIONS = new Set(['.ts', '.tsx']);

// Directories and file patterns to ignore to keep token count safely under the 1M ceiling
const IGNORED_PATH_PATTERNS = [
  '/components/ui/',      // Primitive UI wrappers (Radix/shadcn)
  '/logos/',              // Assets
  '.test.',               // Test files
  '.spec.',
  '.d.ts'                 // Type definitions
];

// Skip files larger than 40KB (usually huge template dumps or mock data)
const MAX_FILE_SIZE_BYTES = 40 * 1024;

// 2. Helper to extract the OpenRouter Key from .env
function getOpenRouterKey() {
  try {
    if (!fs.existsSync(ENV_PATH)) return null;
    const envContent = fs.readFileSync(ENV_PATH, 'utf8');
    const match = envContent.match(/^OPENROUTER_API_KEY\s*=\s*(.*)$/m);
    return match ? match[1].trim() : null;
  } catch (error) {
    console.error('Error reading .env file:', error.message);
    return null;
  }
}

// 3. Helper to recursively gather code files while filtering out noise
function gatherFiles(dir, filesList = []) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (!item.startsWith('.') && item !== 'node_modules' && item !== '.next') {
        gatherFiles(fullPath, filesList);
      }
    } else {
      const ext = path.extname(item);
      const normalizedPath = fullPath.replace(/\\/g, '/');
      
      const isIgnoredPattern = IGNORED_PATH_PATTERNS.some(pattern => normalizedPath.includes(pattern));
      const isTooLarge = stat.size > MAX_FILE_SIZE_BYTES;

      if (ALLOWED_EXTENSIONS.has(ext) && !isIgnoredPattern && !isTooLarge) {
        filesList.push(fullPath);
      }
    }
  }
  return filesList;
}

// 4. Main script execution flow
async function main() {
  const apiKey = getOpenRouterKey();
  if (!apiKey || apiKey.startsWith('your_')) {
    console.error('❌ Error: OPENROUTER_API_KEY not found or unconfigured in .env');
    process.exit(1);
  }

  console.log('🔍 Scanning codebase for core business logic and architecture...');
  
  let allFiles = [];
  for (const dir of SCAN_DIRS) {
    if (fs.existsSync(dir)) {
      gatherFiles(dir, allFiles);
    }
  }
  
  console.log(`📦 Found ${allFiles.length} key source files to bundle.`);

  // Build the unified codebase context
  let codebaseContext = '';
  for (const filePath of allFiles) {
    const relativePath = path.relative(REPO_ROOT, filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    
    codebaseContext += `\n--- START OF FILE: ${relativePath} ---\n`;
    codebaseContext += content;
    codebaseContext += `\n--- END OF FILE: ${relativePath} ---\n`;
  }

  // Pre-flight check on character count (1 token ≈ 4 characters)
  const approxTokens = Math.round(codebaseContext.length / 3.8);
  console.log(`📊 Estimated token payload: ~${approxTokens.toLocaleString()} tokens`);

  if (approxTokens > 850000) {
    console.warn('⚠️ Warning: Payload is close to 1M tokens. If API fails, exclude non-essential components.');
  }

  // 5. CRITICAL PROMPT - COMPLETE USER RANT & ALL PROBLEMS
  const brainStormPrompt = `need you to look at my runs id , engagements id, engagements id skill files, something doesnt convince me this is ready to enter the market, i mean real world usage, somethings are off, point those out,tell me whats not right

Here is the codebase:
${codebaseContext}

Please provide your complete, honest, brutal, and actionable analysis.
`;

  console.log(`🚀 Transmitting context to OpenRouter using model: ${MODEL}...`);

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://localhost:3000',
        'X-Title': 'Architect Tool',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'user', content: brainStormPrompt }
        ]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API responded with status ${response.status}: ${errorText}`);
    }

    const json = await response.json();
    const markdownOutput = json.choices?.[0]?.message?.content ?? 'No response content.';

    const outputReportPath = path.join(REPO_ROOT, 'AI_ARCHITECT_REPORT.md');
    fs.writeFileSync(outputReportPath, markdownOutput, 'utf8');
    
    console.log(`\n✅ Success! Analysis and report written to: \x1b[32m${outputReportPath}\x1b[0m`);

  } catch (error) {
    console.error('❌ Request to OpenRouter failed:', error.message);
  }
}

main();