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

  // 5. CRITICAL PROMPT WITH ALL YOUR CONCERNS
  const brainStormPrompt = `
You are a senior full-stack software engineer, visionary architect, and enterprise product strategist with deep experience in distributed systems, background workers, and SaaS architecture. I am giving you the entire context of my project and I need a CRITICAL, HONEST, AND THOROUGH analysis.

## URGENT CRISIS SITUATION

I am experiencing severe issues with my Inngest background workers that are making the system unpredictable and frustrating to use. Here's what happened:

**The Black Box Error Problem:**
I started onboarding and registered a new client. During the process, I encountered:

> GHL appointments fetch failed [422]

Steps(3 steps)
Run started [Nightly cron (Inngest)] - 0ms 20:00:15
Checking today's calls - 35.0s 20:00:32
Interrupted — the run failed before this step finished.
Checking today's calls - 11.7s 20:00:55
Interrupted — the run failed before this step finished.

• GHL appointments fetch failed [422]

Claude told me this was because of a bad location ID, but my location ID IS correct. This is a black box error - I have no idea what's actually wrong or how to fix it.

**The Pause System Is Broken:**
I paused the automations in dashboard/engagements/id last night. The system explicitly said:
> "This client is paused — nightly briefs, leak map, win-back, weekly metrics, and booking polling are all skipping it. Reason: error. Manual 'Run' buttons below still work if you need to test something."

BUT 3 hours later I checked and found:

Leak Map run - Run ID: 54ab7e59-e72c-4ce7-9298-1eacd54b5f66
Run started [Weekly cron (Inngest)] - 0ms 09:00:09
Pulling your account data - 149ms 09:00:51
0 brief(s) in current window
Crunching the numbers - 194ms 09:00:51
Flagging the biggest issues - 0ms 09:00:51
Overall severity: none
Writing your report - 58ms 09:00:51
No summary was recorded for this run. Re-triggering the module will produce a full summary going forward.

**THE PAUSE DID NOT ACTUALLY PAUSE THE CLIENT!** The leak map ran anyway, and the pre-call reads gave me the same 422 error. This is incredibly frustrating - I don't know what to do, I'm contemplating deleting the client, but I'm afraid Inngest will keep doing its thing regardless.

**The "No Summary Was Recorded" Mystery:**
What is this "no summary was recorded for this run" thing? I'm confused whether this whole flow even works or if I'm just wasting my time creating TS files and everything is poorly executed. If I cancel or execute the skill run on Inngest, would that break the system? I don't even know why the leak map ran - was it after the pause automations or after some days?

## THE USER EXPERIENCE NIGHTMARE

The app is just frustrating to use. Users can't master anything - they don't know when to expect what. Everything is rigid with no user understanding. The leak map runs say "Pipeline - Writing your report" but then renders:

Steps(5 steps)
Run started [Weekly cron (Inngest)] - 0ms 09:00:09
Pulling your account data - 149ms 09:00:51
0 brief(s) in current window
Crunching the numbers - 194ms 09:00:51
Flagging the biggest issues - 0ms 09:00:51
Overall severity: none
Writing your report - 58ms 09:00:51
No summary was recorded for this run. Re-triggering the module will produce a full summary going forward.

If the app has issues or configuration errors (like a user using wrong params), it should show up on the queue for their intervention and properly diagnose and guide the user for what credentials to update. We need to ensure we're doing this well.

i need to understand what i am doing, everything looks fallen apart, scan the entire file in this project and come up with solutions, not saying you should like write the codes for all the files, but detail everything in serious details,what is wrong, what i should do right for this to compete in the international market

i also feel we are not utilizing what the queue could be for actions, review and all that the app has to offer




Here is the codebase:
${codebaseContext}

Please provide your complete, honest, and actionable analysis.
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
    
    console.log(`\n✅ Success! Analysis and ideas have been written to: \x1b[32m${outputReportPath}\x1b[0m`);

  } catch (error) {
    console.error('❌ Request to OpenRouter failed:', error.message);
  }
}

main();