/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

// 1. Updated Configuration
const REPO_ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(REPO_ROOT, '.env');

// Scan both your source code and data layers
const SCAN_DIRS = [
  path.join(REPO_ROOT, 'src')
];

// Choose a model on OpenRouter with an ultra-large context window
const MODEL = 'anthropic/claude-fable-5';

// Allowed formatting extensions to package up
const ALLOWED_EXTENSIONS = new Set(['.ts', '.tsx', '.json', '.css']);
const IGNORED_FILES = new Set(['icon.ico', 'favicon.ico']); // Skip binary formats

// 2. Helper to extract the OpenRouter Key from your src/.env file
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

// 3. Helper to recursively gather files safely ignoring deep module dependencies
function gatherFiles(dir, filesList = []) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (!item.startsWith('.') && item !== 'node_modules') {
        gatherFiles(fullPath, filesList);
      }
    } else {
      const ext = path.extname(item);
      if (ALLOWED_EXTENSIONS.has(ext) && !IGNORED_FILES.has(item)) {
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
    console.error('❌ Error: OPENROUTER_API_KEY not found or unconfigured in src/.env');
    process.exit(1);
  }

  console.log('🔍 Scanning codebase inside src/ and prisma/...');
  
  let allFiles = [];
  for (const dir of SCAN_DIRS) {
    if (fs.existsSync(dir)) {
      gatherFiles(dir, allFiles);
    }
  }
  
  console.log(`📦 Found ${allFiles.length} source files to bundle.`);

  // Build the unified codebase context
  let codebaseContext = '';
  for (const filePath of allFiles) {
    const relativePath = path.relative(REPO_ROOT, filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    
    codebaseContext += `\n--- START OF FILE: ${relativePath} ---\n`;
    codebaseContext += content;
    codebaseContext += `\n--- END OF FILE: ${relativePath} ---\n`;
  }

  // 5. Tailored Brainstorming Prompt for your Unified Revenue Operations System
  const brainStormPrompt = `
You are a senior full-stack software engineer, visionary architect, and enterprise product strategist. I am giving you the entire context of my project.

This system is an automation, workflow orchestration, and revenue intelligence engine for high-ticket sales ecosystems. It operates using five core modules ("Skills"):
1. Pin Down: Automates client onboarding setups, encrypted credential token vaulting, brand voice profile extraction via Claude, and booking calendar landing zone confirmation generation.
2. Pile On: Fires automated pre-call sequences (emails/SMS) when a booking is logged.
3. Pre-Call Read: Compiles contextual closer briefings by running live web-search background research on prospects using a specialized Claude tool, speaking of claude tool if there are better or more efficient ways to do research or conduct background research for prospects let us know, i was thinking of apollo but that would require users to add their apollo keys i dont know if that is ideal just think of how we can improve this pre call reads.
4. Win-Back: Coordinates re-engagement cadences for prospects who cancelled or no-showed, scaling the touches to custom recovery time windows, think of how we can improve this too.
5. Leak Map: Audits pipeline metrics (show-rate, open-rate, CRM win-rate) using data sample minimums to alert operators to conversion leaks,think of how we can improve the leak map too .

Review the codebase attached below and provide:
1. Code & Architectural Critique: Analyze how our Inngest background workers handle step-level checkpointing, multi-tenant state separation, database transactions via Drizzle, or error handling. Point out potential vulnerabilities or structural optimizations , basically analyze if there is any additional or improvement we can do to make our background workers highly efficient .
2. 10x Product Expansion Ideas: Suggest advanced product enhancements or intelligence features that fit natively into this system's architecture (e.g., real-time cross-client analytics, conversation intelligence hooks, predictive pipeline scoring), i need very good ideas that would make people really dependable on this platform, i noticed that we integrate with like klaviyo or GHL, do we build our own CRM so people depend on our platform , i know building a scheduling platform like calendly make not be ideal but the CRM route what are your opinions, i need this to be the all in one sales app for call reps, dont limit the project , need ways we can expand to other related sales sector that will make this app really expansive and ideal.
3. Integration Synergy: How can we expand or deepen platform connectivity with additional CRM flows, communication nodes, or data signals to amplify value for our end operators?
4. What can we do to make this app dependable and also i am aware there may be many saas or business similar to this, what can we do to stand out, seems we are integrating lots of external apis but what do we own that makes us stand out and not just be a wrapper, i am open to expanding to current stack by anymeans even if it means integrating Golang or rust or whatever to make this highly efficient, i need this to be so good people recommended it for businesses
5. Study the pin down, pile on, pre call read, win back, ,leak map infact study the codebase and understand better  what areas can we improve , like any email tracking or what we can do better , i dont want this to be dull or a place that stresses people out or for people to have second thought on why they need this platform, 
6. Also give advice , if theres any vulnerability that could affect the project in the longrun, what we can do better, i need ideas, not saying you should code anything but think like a business manager that is looking at the business and analyzing


Here is the codebase:
${codebaseContext}
`;

  console.log(`🚀 Transmitting context to OpenRouter using model: ${MODEL}...`);

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://localhost:3000',
        'X-Title': ' Architect Tool',
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
    
    console.log(`\n✅ Success! Analysis and ideas have been written to: \x1b[32m${outputReportPath}\x1b[0m`);

  } catch (error) {
    console.error('❌ Request to OpenRouter failed:', error.message);
  }
}

main();