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
const MODEL = 'anthropic/claude-fable-5';

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
  const brainStormPrompt = `
You are a senior full-stack software engineer, visionary architect, and enterprise product strategist who has built products that compete with Asana, Monday.com, and Grok. I'm giving you my entire codebase and I need a BRUTALLY HONEST, NO-HOLDS-BARRED analysis of everything wrong with this application. I'm at the point of killing this project entirely.

## THE CORE PROBLEM: This is a 30/100 app that NO ONE will pay for

This application rates 30 out of 100. People would rather use OpenClaw, Hermes, or other SaaS products. No one, I repeat NO ONE will subscribe to this app the way it is. I need you to understand why and tell me how to fix it fundamentally.

Look at what's making waves: Grok bot in its beta stage, CoWork, Asana. These are apps that KNOW what they're doing. This app is LOST and makes me sad because what I thought it could be, I'm not seeing that richness. I'm not seeing that quality in all the skills. It's highly generic and too basic for a sales person to depend on it.

## SPECIFIC HORROR STORIES FROM ACTUAL USAGE

### Problem 1: Pre-Call Reads Running When Turned Off
Someone who NEVER enrolled for pre-call reads during onboarding is getting a LIVE EXECUTION of a pre-call brief. When they open the run, they see: "Pre-Call Read is turned off for this engagement — nothing ran."

This is like playing hide and seek. Live executions should be smart enough to know this and also the queue panel is another headache - look into what is bad about it. The engagement ID should ONLY render contents for whatever skills are turned on. The moment someone activates pre-call reads or any other skill, THEN it should show. The major thing is to be SMOOTH about this.

### Problem 2: The "Call Brief" is a Terminal Read, Not an Assistant
I got a run that failed because I didn't put my Slack stuff in order during onboarding. But it still doesn't feel like a call brief - it feels like reading a terminal output. 

I got: "Unknown. Call time: 16:00 on 11/08/2026. Identity Match: 30/100. Delivery Channel: slack. Synthesized Brief Content: No brief text generated for this call."

Seriously? What IS a call brief? Shouldn't it explain things or be like an assistant rather than a terminal read? Most people booking calls just give us their emails, phone numbers, and some rarely drop notes. I don't even know if we're able to extract notes or anything. But ask yourself - what REALLY is a call brief?

### Problem 3: No Intelligence About Meeting Context
Yesterday I told the person who booked that they shouldn't attend the meeting. Let me see how the app responds to it. I didn't even understand or get any info or anything. I check the pre-call sequence and see this garbage:

Execution Steps(4 steps)
- Run started [Unknown <email> (polled)] - 0ms 14:30
- Roster updated - 0ms 14:30
- Adding lead to follow-up sequence [Unknown <email>] - Enrolled Unknown in pre-call sequence - 5.5s 14:30
- Sent rebooked exit signal (no-op if they were never in win-back) - 0ms 14:30

Summary:
- What ran: Enroll Unknown in the pre-call follow-up sequence on GHL
- What worked: Enrolled in GHL pre-call sequence
- What needs attention: No errors during this run

Then I open the list and see a table with "Email Sequence Dispatch: Enrolled Unknown in pre-call sequence", "SMS Sequence Dispatch: Not configured", "Ad Attribution Cohort Sync: Not configured"

### Problem 4: The Funnel Audit is Useless Technical Jargon
I got this funnel audit output and I don't understand what to do with it:

Run started [Weekly cron (Inngest, UTC)] - 0ms 9:00
Pulling your account data [0 brief(s) in current window] - 140ms 9:00
Crunching the numbers - 980ms 9:00
Flagging the biggest issues [Overall severity: none] - 0ms 9:00
Writing your report - 84ms 9:00
Delivered via dashboard_only - 82ms 9:00

Summary:
- What ran: Audited conversion funnel metrics (weekly run), Evaluated drop-off points and severity thresholds
- What worked: Computed funnel metrics across pipeline stages, Generated comprehensive audit report
- What needs attention: No errors during this run.
- Decisions: Assigned funnel health severity: none

Then the dashboard shows:
Overall Funnel Health: Stable (weekly audit · 3 metrics evaluated)
- Brief delivery volume: none - 0 (was 0)
- Identity match accuracy: none - 0 (was 0)  
- CRM pipeline win-rate (%): none - 0 (was 0)

Identified Data Gaps:
- [insufficient-data] Brief delivery volume: sample too small (current n=0, prior n=0, floor=5)
- [insufficient-data] Identity match accuracy: sample too small (current n=0, prior n=0, floor=5)
- [insufficient-data] CRM pipeline win-rate (%): sample too small (current n=0, prior n=0, floor=5)

Like I don't understand what to do with all this. The app feels too technical and lacks user friendliness or usability.

### Problem 5: The Dashboard is a Counting Exercise, Not Intelligence
When you first visit the dashboard you get stuff like "active accounts", "tasks completed", and "issues". So if a user has over 500 tasks completed, it shows? How does that metric help daily or weekly? 

This week users need to know what's happened, issues, or actions. It should be a survey, not some damn count read. The dashboard at a glance could be so much more - should be highly useful to help users at a glance understand what is happening. 

### Problem 6: No Notification System for Real-Time Awareness
Users don't even see notification counts on the executions when they open the app. Because the live execution is underneath the queue, I wonder whether users will even know what's happening real time.

### Problem 7: The Engagements ID Page and Calendar Views, list and board views are just confusing, i like the calender view but i feel it could be much more especially when you open it
The engagements ID page and the calendar view could do so much more. The runs ID view of all the skills are not returning what I need.

### Problem 8: Win-Backs and Revenue Recovery i am not convinced this is doing a good job, we need to actually be a place people will depend on rather than their crm 
Because I didn't talk about the win-backs doesn't mean I'm not worried about it. All that win-back revenue and all that - look into it. The whole win-back system, the whole funnel audit.

## THE GAP: What This Is vs. What It Should Be

This app fetches metadata (which anyone can do). It doesn't DELIVER VALUE. It shows raw data. It doesn't provide INSIGHT. It's a developer's terminal, not a sales professional's assistant.

Compare this to:
- **Grok**: Makes AI feel intelligent and conversational
- **Asana**: Makes project management feel intuitive and actionable
- **CoWork**: Makes coworking space management feel seamless

These apps KNOW what they're doing. They've solved the "last mile" problem of making powerful infrastructure feel simple and valuable.

## WHAT I NEED FROM YOU

### Architectural Analysis
1. Analyze my ENTIRE codebase with these specific problems in mind
2. Don't just identify bugs - identify the ARCHITECTURAL failures that lead to these experiences
3. Look at EVERY SKILL (pre-call reads, call briefs, win-backs, funnel audits, leak maps) and redesign them from a USER perspective

### Complete Redesign Requirements
4. Redesign what a call brief SHOULD be - make it compete with the best SaaS products. It should be an assistant that tells me: who I'm talking to, what they care about, what happened before, what I should focus on, and what the next steps are.
5. Fix the skill activation logic - engagements should ONLY execute and show what's activated. The queue panel needs fixing too.
6. Make this an ASSISTANT, not a terminal - the UX should help users, not show them infrastructure. Remove ALL third-party branding (Inngest, Nightly, etc.) from user-facing surfaces.
7. Design proper error states** that GUIDE users to fix issues with clear instructions, not just show raw error codes like [422] and "GHL appointments fetch failed"
8. Redesign the queue architecture - what SHOULD the queue be doing for actions, reviews, and interventions? How do we make real-time execution visible and understandable?
9. Redesign the dashboard - make it a weekly/daily intelligence briefing, not a counter. Show: what needs attention, what happened this week, trends, anomalies, recommended actions.
10. Fix the funnel audit - make it human-readable with clear: "Here's what's happening in your pipeline, here's where you're losing people, here's what to do about it"
11. Design a notification system - users should know immediately when something happens
12. Make win-backs VISIBLE and VALUABLE - show recovered revenue opportunities, not just "enrolled in sequence"

### The Ultimate Question
How do we go from fetching metadata (which anyone can do) to actually DELIVERING VALUE that makes someone choose this over OpenClaw, Hermes, or other SaaS products? How do we make this a tool that sales professionals DEPEND ON daily?

Give me the COMPLETE architectural redesign needed. Tell me if this is salvageable or if I should kill it. If salvageable, provide the detailed roadmap from 30/100 to 90/100.

i need well detailed practical steps, suggestions, code audit, deep down real fixes suggestion to apply, ideas, push backs, i need your help

look at similar or our competitors and see what they are doing and what we could do better or different to compete and bring suggestions and all, inngest could do much more and bring more value for us, i dont need your praises, i need real raw facts and truth not gaslighting, help me out

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