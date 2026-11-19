/* The feedback form's questions and choices, written once.
   - tools/build-feedback.mjs builds public/feedback.html from this.
   - api/_feedback.js checks every answer against it and saves the choice exactly as it reads on the page.
   - supabase/migrations/015_feedback.sql allows exactly these texts; test/feedback.spec.mjs fails if any of the three differ.
   The short keys are only the values the page sends; the database stores the text on the right. */
export const FORM = {
  status: { n: 1, q: "Are you a student or working?", opts: { student: "Student", working: "Working professional", other: "Other" } },
  target_role: { n: 3, q: "Which role are you aiming for?",
    opts: { pm: "Product Manager", pjm: "Project Manager", ba: "Business Analyst", other: "Something else", unsure: "Not sure yet" } },
  prepare: { n: 4, q: "How are you preparing for your target role right now?", many: true,
    opts: { google: "Google search", youtube: "YouTube", courses: "Online courses", chatgpt: "ChatGPT or other AI", linkedin: "LinkedIn posts",
      mentors: "Mentors or friends", books: "Books", none: "I have not started" } },
  struggle: { n: 5, q: "What is the hardest part of preparing for your target role?", many: true,
    opts: { order: "Knowing what to learn first and next", testing: "Testing whether I really know it", too_many: "Too many resources",
      time: "Finding the time", interviews: "Getting ready for interviews", other: "Something else" } },
  heard: { n: 6, q: "How did you hear about CareerPath?",
    opts: { whatsapp: "WhatsApp or group chat", friend: "A friend or classmate", class: "In class or from a professor", linkedin: "LinkedIn",
      poster: "A poster or flyer", other: "Something else" } },
  tried: { n: 7, q: "Have you tried CareerPath?", opts: { yes: "Yes", no: "Not yet" } },
  used: { n: 8, q: "Which parts did you use?", many: true,
    opts: { match: "Role match (resume or questions)", roadmap: "Roadmap", lessons: "Lessons", practice: "Practice with hints",
      assessments: "Assessments and stars", assistant: "Study assistant", leaderboard: "Leaderboard", challenge: "Weekly challenge" } },
  device: { n: 10, q: "What did you use it on?", many: true, opts: { phone: "Phone", laptop: "Laptop", tablet: "Tablet" } },
  favorite: { n: 13, q: "Which part did you like most?", opts: null },   // the same choices as "used"
  continue_use: { n: 14, q: "Will you keep using CareerPath?",
    opts: { regularly: "Yes, regularly", sometimes: "Now and then", interviews: "Only before interviews", no: "No" } },
  pmf: { n: 15, q: "How would you feel if you could no longer use CareerPath?",
    opts: { very: "Very disappointed", somewhat: "Somewhat disappointed", not: "Not disappointed" } },
  why_not: { n: 8, q: "What stopped you so far?",
    opts: { no_time: "No time yet", not_sure: "Not sure it is for me", forgot: "I forgot about it", other: "Something else" } }
};
FORM.favorite.opts = FORM.used.opts;

/* The questions without a fixed list of choices, for the page and the readable view. */
export const OPEN = {
  school: { n: 2, q: "Your school and program" },
  ease: { n: 9, q: "How easy was it to get started?" },
  broken: { n: 11, q: "Did anything look broken or confusing?" },
  lessons: { n: 12, q: "How helpful were the lessons in the modules?" },
  lessons_better: { q: "What would make the lessons better?" },
  change_mind: { q: "What would change your mind?" },
  recommend: { n: 16, q: "How likely are you to recommend CareerPath to a friend?" },
  add_or_change: { n: 17, q: "One thing you would add or change" },
  would_try: { n: 9, q: "What would make you try it?" },
  email: { q: "Want us to follow up?" }
};
