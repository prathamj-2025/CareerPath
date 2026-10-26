/* Builds the static website pages in public/ (About, Help and support, FAQ, Contact, Terms, Privacy).
   Run: node tools/build-pages.mjs
   One template, so the header and footer are the same on every page. The pages are plain HTML on
   purpose: they load fast, work without JavaScript, and search engines can read them.
   The support address shown on them is filled in from /api/config (SUPPORT_EMAIL) by site.js,
   with DEFAULT_SUPPORT as the fallback until the CareerPath mailbox is set. */
import { writeFileSync } from "node:fs";

const DEFAULT_SUPPORT = "careerpath531@gmail.com";
const UPDATED = "October 26, 2026";
const OUT = new URL("../public/", import.meta.url).pathname;

const NAV = [["about.html", "About"], ["faq.html", "FAQ"], ["help.html", "Help and support"], ["contact.html", "Contact"]];
const FOOT = [["about.html", "About"], ["faq.html", "FAQ"], ["help.html", "Help and support"], ["contact.html", "Contact"],
              ["privacy.html", "Privacy"], ["terms.html", "Terms"]];

const mail = `<a class="support-email" href="mailto:${DEFAULT_SUPPORT}">${DEFAULT_SUPPORT}</a>`;

const ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%2314532D'/%3E%3Cg fill='none' stroke='white' stroke-width='2.1' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M16 7 28 13 16 19 4 13Z'/%3E%3Cpath d='M9 16.5v5.2c0 2.2 3.1 4 7 4s7-1.8 7-4v-5.2'/%3E%3Cpath d='M28 13v7'/%3E%3C/g%3E%3C/svg%3E";
const CAP = `<svg viewBox="0 0 32 32" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 7 28 13 16 19 4 13Z"/><path d="M9 16.5v5.2c0 2.2 3.1 4 7 4s7-1.8 7-4v-5.2"/><path d="M28 13v7"/></svg>`;

function page({ file, title, desc, h1, lead, body }) {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} | CareerPath</title>
<meta name="description" content="${desc}">
<link rel="icon" href="${ICON}">
<script>try{var t=localStorage.getItem("cp-theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}</script>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">
<link rel="stylesheet" href="site.css">
</head>
<body>
<header class="site-head">
  <div class="wrap head-row">
    <a class="brand" href="/" aria-label="CareerPath home"><span class="brand-mark">${CAP}</span><span class="brand-name">career<span>path</span></span></a>
    <nav aria-label="Site">
      ${NAV.map(([h, l]) => `<a href="${h}"${h === file ? ' aria-current="page"' : ""}>${l}</a>`).join("\n      ")}
    </nav>
    <a class="btn" href="/">Open CareerPath</a>
  </div>
</header>
<main class="wrap">
  <h1>${h1}</h1>
  <p class="lead">${lead}</p>
${body}
</main>
<footer class="site-foot">
  <div class="wrap foot-row">
    <span>&copy; 2026 CareerPath</span>
    <nav aria-label="Footer">${FOOT.map(([h, l]) => `<a href="${h}">${l}</a>`).join("")}</nav>
  </div>
</footer>
<script src="site.js"></script>
</body>
</html>
`;
  writeFileSync(OUT + file, html);
}

const faqs = [
  ["What is CareerPath?", "CareerPath is a learning site for students preparing for a specific job. You choose a target role, follow the roadmap of skills that role needs, learn each one through short lessons, and prove it with assessments. Progress moves only through assessment, so nothing can be checked off by hand."],
  ["Is it free?", "Yes. CareerPath is free to use today."],
  ["Which roles are there?", "Product Manager, Project Manager and Business Analyst. Each has its own roadmap, lessons and assessments, because the same skill is used differently in each job. The Business Analyst roadmap is being expanded."],
  ["How do I choose a role?", "If you already know, pick it. If not, answer five short questions with no wrong answers, optionally with your resume, and CareerPath gives each roadmap a match score with a reason. The score is advice, not a rule. You can switch roadmaps at any time from the role menu at the top of the page."],
  ["What happens to my progress if I switch roles?", "Nothing is lost. Stars stay attached to the roadmap they were earned on, and you can come back to it later. Stars do not transfer between roadmaps, because the same skill is assessed differently for each role."],
  ["How do stars work?", "Each sub-module has an assessment. Your best score sets your level: 50% earns 1 star, 65% earns 2, 75% earns 3, 85% earns 4, and 95% plus an accepted practical project earns 5. You write the project on CareerPath and the AI reviews it the way a hiring manager would. Three stars means job-ready."],
  ["How do I earn a certificate?", "Certificates are earned per main module. Get every required sub-module in that module to job-ready (three stars), then pass the module exam with 75% or more."],
  ["Do I have to follow the order?", "No. The numbering is a suggested order. You can open any sub-module at any time."],
  ["Who can see me on the leaderboards?", "There are two. The course leaderboard is limited to students at your own school on the same roadmap. The weekly challenge leaderboard is open to students from every college. Both show only your first name, last initial and score, and the challenge board also shows your school. You can turn this off in Profile, and you will be hidden from both boards while keeping your progress."],
  ["Is the study assistant always right?", "No. It is an AI model and it can make mistakes. Use it to understand what you are reading, and check anything important against the lesson or another source."],
  ["What happens to my resume?", "It is read in your browser. Only a short summary is saved with your profile: the file name, its length, and the skills and role titles found in it. The full text is not stored. If you ask CareerPath to rank roadmaps, the text is sent to our AI provider to produce the ranking and is not kept."],
  ["I did not get the verification email.", "Check your spam folder first, then use the Resend button on the sign-in page. If it still does not arrive in a few minutes, contact us and we will help."],
  ["I forgot my password.", "On the sign-in page choose Forgot password. We will email you a link to set a new one. If you signed up with Google, use Continue with Google instead."],
  ["How do I delete my account?", "Open Profile and choose Delete my account. This permanently removes your account and saved progress. It cannot be undone."],
  ["Which browsers work?", "Current versions of Chrome, Edge, Safari and Firefox, on a laptop, tablet or phone."],
];

page({
  file: "about.html", title: "About", h1: "About CareerPath",
  desc: "CareerPath helps students prepare for a specific job with a clear roadmap of skills, short lessons and honest assessments.",
  lead: "A guided path from where you are to the job you want, with assessments that show you are ready.",
  body: `
  <h2>What we do</h2>
  <p>Most career advice says what to learn without saying whether you have learned it. CareerPath starts from a target role, lays out the skills that role needs, teaches each one through that role's lens, and then tests it. Stars are earned only by passing an assessment, so what you see on your roadmap is what you can actually do.</p>

  <h2>How it works</h2>
  <ol class="steps">
    <li><b>Pick a role.</b> Choose Product Manager, Project Manager or Business Analyst, or answer five short questions and get a match score for each.</li>
    <li><b>Learn the skills.</b> Each roadmap is split into main modules and sub-modules with short lessons, worked scenarios and practice with hints.</li>
    <li><b>Prove it.</b> Take the assessment to earn one to five stars. Pass a module exam to earn that module's certificate.</li>
    <li><b>Keep going.</b> Join the weekly challenge, climb the leaderboards, and ask the study assistant when something is unclear.</li>
  </ol>

  <h2>What makes it different</h2>
  <ul>
    <li><b>Role-specific.</b> The same skill, such as stakeholder management, is taught and tested differently for a product manager than for a project manager.</li>
    <li><b>Verified, not self-reported.</b> There is no checkbox for "I know this".</li>
    <li><b>Built for students.</b> Free to use, with a leaderboard limited to your own school.</li>
  </ul>

  <h2>Who built it</h2>
  <p>CareerPath started as a team project for MOR 531 at the University of Southern California and is now being built as a real product by the same students. Questions, feedback and ideas are welcome on the <a href="contact.html">contact page</a>.</p>`
});

page({
  file: "faq.html", title: "FAQ", h1: "Frequently asked questions",
  desc: "Answers about roles, stars, certificates, the leaderboard, your resume, your account and the study assistant.",
  lead: "Short answers to the things people ask most. If yours is not here, <a href=\"contact.html\">tell us</a>.",
  body: `  <div class="faq">
${faqs.map(([q, a]) => `    <details><summary>${q}</summary><p>${a}</p></details>`).join("\n")}
  </div>`
});

page({
  file: "help.html", title: "Help and support", h1: "Help and support",
  desc: "Get started with CareerPath, fix sign-in problems and find out how to reach us.",
  lead: "Getting started, fixing common problems, and how to reach a person.",
  body: `
  <h2>Getting started</h2>
  <ol class="steps">
    <li><b>Create your account</b> with your email and a password, or use Continue with Google. If you use email, open the verification link we send you before signing in.</li>
    <li><b>Tell us a little about you:</b> your school, major and graduation year. Your school sets which course leaderboard you appear on.</li>
    <li><b>Choose a role.</b> Pick one, or answer the five questions to get a match score for each.</li>
    <li><b>Open a module,</b> read a lesson, and take the assessment when you are ready.</li>
  </ol>

  <h2>Fixing common problems</h2>
  <div class="faq">
    <details><summary>I cannot sign in</summary><p>Check the email and password for typos. If you created the account with Google, use Continue with Google. If you signed up with email, make sure you opened the verification link first. You can reset your password from the sign-in page.</p></details>
    <details><summary>The verification or reset email never arrived</summary><p>Look in spam or junk, and search for CareerPath. Use the Resend button on the sign-in page. Emails can take a few minutes. If nothing arrives, contact us with the email address you used.</p></details>
    <details><summary>My progress looks wrong</summary><p>Progress is saved to your account, so sign out and back in to refresh it. If a score or star is still missing, send us the sub-module name and what you expected to see.</p></details>
    <details><summary>My resume was rejected</summary><p>CareerPath checks that the file is a resume. Upload a PDF, Word (.docx) or text resume with your experience, education and skills. Scanned images have no readable text, so export a text PDF instead. You can also continue without a resume.</p></details>
    <details><summary>The study assistant is not answering</summary><p>The assistant can be unavailable for a short time when its provider is busy. Wait a minute and try again. If it keeps failing, tell us.</p></details>
    <details><summary>Something looks broken on my screen</summary><p>Reload the page, and try a current version of Chrome, Edge, Safari or Firefox. If it is still wrong, send a screenshot and the browser you use.</p></details>
  </div>

  <h2>Still stuck?</h2>
  <p>Email us at ${mail}. Tell us what you were doing, what you expected, and what happened, and include a screenshot if you can. Please do not send your password.</p>
  <p>More answers are on the <a href="faq.html">FAQ</a>.</p>`
});

page({
  file: "contact.html", title: "Contact", h1: "Contact us",
  desc: "Reach the CareerPath team with a question, a bug report or an idea.",
  lead: "We read every message.",
  body: `
  <div class="cards">
    <div class="card"><h3>Questions and support</h3><p>Trouble signing in, a question about your progress, or something that looks wrong.</p><p>${mail}</p></div>
    <div class="card"><h3>Feedback and ideas</h3><p>A skill you want covered, a lesson that confused you, or a feature you would use.</p><p>${mail}</p></div>
    <div class="card"><h3>Privacy requests</h3><p>Questions about your data. You can delete your account yourself under Profile at any time.</p><p>${mail}</p></div>
  </div>
  <h2>What to include</h2>
  <ul>
    <li>The email address on your account (never your password).</li>
    <li>What you were doing, what you expected, and what happened.</li>
    <li>A screenshot and the browser you use, if it is a display problem.</li>
  </ul>
  <p class="muted">We reply as soon as we can. CareerPath is run by a small student team, so please allow a few days.</p>`
});

page({
  file: "terms.html", title: "Terms of use", h1: "Terms of use",
  desc: "The rules for using CareerPath.",
  lead: `Last updated ${UPDATED}. By creating an account or using CareerPath you agree to these terms.`,
  body: `
  <h2>Your account</h2>
  <p>Give accurate information when you sign up and keep your password private. You are responsible for what happens under your account. CareerPath is meant for university students and other adult learners and is not intended for children under 13.</p>

  <h2>Using CareerPath</h2>
  <ul>
    <li>Use it to learn, for yourself. Do not share your account.</li>
    <li>Do not try to cheat the assessments, change your scores or stars, or interfere with other students' results.</li>
    <li>Do not copy, scrape or resell the lessons, questions or other content, or attack, overload or probe the service.</li>
    <li>Do not post anything unlawful or abusive in your answers or messages.</li>
  </ul>
  <p>We may suspend or remove accounts that break these rules, and we may remove a score that was gained unfairly.</p>

  <h2>Content</h2>
  <p>The lessons, questions, assessments and design of CareerPath belong to CareerPath and its authors. You may use them for your own learning. What you write in your answers remains yours, and you allow us to process it to run the service, for example to grade it and give feedback.</p>

  <h2>Certificates, stars and scores</h2>
  <p>Stars, scores and certificates show what you have completed on CareerPath. They are not a degree, an accredited qualification, or a promise of a job or an interview. Employers decide for themselves what they value.</p>

  <h2>The study assistant and AI feedback</h2>
  <p>The study assistant and any AI feedback are produced by an AI model. It can be wrong or incomplete. Treat it as a study aid and check anything that matters.</p>

  <h2>No guarantees</h2>
  <p>We work to keep CareerPath available and accurate, but it is provided as it is, without warranties. To the extent the law allows, we are not liable for losses that come from using it or from it being unavailable, including lost progress. The service may change, and we may add or remove features and roadmaps.</p>

  <h2>Ending your use</h2>
  <p>You can stop at any time and delete your account from Profile. Deleting removes your account and saved progress permanently.</p>

  <h2>Changes to these terms</h2>
  <p>If we change these terms, we will update the date above. Continuing to use CareerPath after a change means you accept it.</p>

  <h2>Contact</h2>
  <p>Questions about these terms: ${mail}. See also our <a href="privacy.html">Privacy Policy</a>.</p>`
});

page({
  file: "privacy.html", title: "Privacy policy", h1: "Privacy policy",
  desc: "What CareerPath collects, why, where it is kept and how to delete it.",
  lead: `Last updated ${UPDATED}. This explains what CareerPath collects, why, where it is kept, and the choices you have.`,
  body: `
  <h2>What we collect</h2>
  <ul>
    <li><b>Account details.</b> Your name and email, plus your school, major and graduation year. If you sign in with Google, Google gives us your name, email address and profile picture.</li>
    <li><b>Your learning.</b> Your chosen roadmap and the roadmaps you left, the lessons you read, your assessment scores, stars, module exam results and points.</li>
    <li><b>Resume summary (optional).</b> If you upload a resume, it is read in your browser. We save only a short summary with your profile: the file name, its length, and the skills and job titles found in it. The full text is not saved.</li>
    <li><b>Placement result.</b> The outcome of the five role questions and the match score for each roadmap.</li>
    <li><b>Messages to the study assistant.</b> The questions you type and any lesson text you select.</li>
  </ul>

  <h2>How we use it</h2>
  <ul>
    <li>To sign you in, save your progress and show it back to you on any device.</li>
    <li>To recommend a roadmap and show your match scores.</li>
    <li>To show the leaderboards.</li>
    <li>To answer study assistant questions and give feedback on written answers.</li>
    <li>To fix problems and keep the service secure.</li>
  </ul>

  <h2>The leaderboards</h2>
  <p>CareerPath has two. The course leaderboard is limited to students at your school on the same roadmap, and shows your first name, last initial and points. The weekly challenge leaderboard is open to students from every college, and shows your first name, last initial, school and challenge score. You can switch both off in Profile and you will be hidden from the boards, with your progress kept.</p>

  <h2>Who handles your data</h2>
  <ul>
    <li><b>Supabase</b> hosts our database and sign-in. Your account and progress are stored there.</li>
    <li><b>Vercel</b> hosts the website and may keep standard server logs, such as IP address and request time.</li>
    <li><b>Google</b> provides Sign in with Google, and Google Gemini is our AI provider. Study assistant questions, the lesson text you are reading, written answers sent for feedback, and (when roadmaps are ranked) your resume text are sent to the AI provider to produce a reply. We do not keep those messages. Google's own terms apply to that processing.</li>
  </ul>

  <h2>Cookies and tracking</h2>
  <p>CareerPath stores a sign-in token in your browser so you stay signed in, and a few settings such as light or dark mode. We do not use advertising or analytics trackers, and we do not sell or share your information with advertisers.</p>

  <h2>Your choices</h2>
  <ul>
    <li><b>Edit</b> your name, school, major and graduation year in Profile.</li>
    <li><b>Hide</b> yourself from the leaderboard in Profile.</li>
    <li><b>Delete</b> your account in Profile. This permanently removes your account and saved progress.</li>
    <li><b>Withdraw Google access</b> at any time in your Google Account settings under third-party connections.</li>
    <li><b>Ask us</b> about your data using the address below.</li>
  </ul>

  <h2>Security and retention</h2>
  <p>Data is sent over encrypted connections and protected by access rules in the database, so each student can read only their own records. We keep your data while your account exists and remove it when you delete the account. No system is perfectly secure, so please use a strong, unique password.</p>

  <h2>Children</h2>
  <p>CareerPath is not intended for children under 13 and we do not knowingly collect their data.</p>

  <h2>Changes</h2>
  <p>If we change this policy, we will update the date above.</p>

  <h2>Contact</h2>
  <p>Questions about this policy: ${mail}.</p>`
});

console.log("pages written to", OUT);
