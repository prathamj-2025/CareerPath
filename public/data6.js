/* Onboarding vocabulary and weekly challenge content.

   CP_SKILL_TERMS  what a resume has to mention for a skill to count as claimed.
   CP_ROLE_TERMS   phrases that point at a whole roadmap rather than one skill.
   CP_CHALLENGES   the weekly challenge library, one set per roadmap.

   Terms are lowercase and matched with word boundaries, so "r" or "ml" never
   match inside a longer word. */
(function () {
  "use strict";

  window.CP_SHARED_SKILLS = {
    "tools-pm": 1, "stats-pm": 1, "bi-pm": 1, "sql-foundations-pm": 1, "sql-joins-pm": 1, "sql-product-pm": 1,
    "python-basics-pm": 1, "pandas-pm": 1, "viz-automation-pm": 1, "aiworkflow-pm": 1, "finance-pm": 1, "comm-pm": 1,
    "metrics-pm": 1
  };

  window.CP_SKILL_TERMS = {
    /* Product Manager */
    "foundations-pm": ["product management", "product manager", "product thinking", "product lifecycle", "product sense"],
    "lifecycle-pm": ["product lifecycle", "mvp", "minimum viable product", "0 to 1", "zero to one", "idea to launch", "end-to-end product"],
    "market-pm": ["market research", "competitive analysis", "competitor analysis", "market sizing", "tam", "swot", "positioning", "market analysis"],
    "strategy-pm": ["product strategy", "business model", "product vision", "go-to-market strategy", "unit economics", "product-market fit", "pricing strategy"],
    "ux-pm": ["ux", "user experience", "wireframe", "wireframes", "prototype", "prototyping", "figma", "usability testing", "design thinking"],
    "agile-pm": ["agile", "scrum", "kanban", "sprint", "sprints", "jira", "standup", "retrospective", "scrum master"],
    "technical-pm": ["api", "apis", "architecture", "system design", "microservices", "technical product", "rest api", "cloud", "aws"],
    "ai-pm": ["ai", "machine learning", "llm", "llms", "rag", "generative ai", "prompt engineering", "nlp", "chatbot", "ai product"],
    "leadership-pm": ["stakeholder management", "stakeholders", "cross-functional", "executive communication", "influence without authority", "alignment"],
    "launch-pm": ["go-to-market", "gtm", "product launch", "launched", "launch plan", "rollout", "beta"],
    "career-pm": ["product portfolio", "case study", "pm interview"],
    "tools-pm": ["jira", "linear", "confluence", "notion", "asana", "trello", "figma", "amplitude", "mixpanel", "roadmunk", "productboard"],
    "stats-pm": ["statistics", "statistical", "p-value", "confidence interval", "sample size", "regression", "hypothesis testing", "statistical significance", "probability"],
    "bi-pm": ["tableau", "power bi", "looker", "metabase", "dashboard", "dashboards", "business intelligence", "bi tool", "data studio"],
    "sql-foundations-pm": ["sql", "mysql", "postgresql", "postgres", "sqlite", "select statement", "database queries"],
    "sql-joins-pm": ["sql joins", "joins", "subquery", "subqueries", "cte", "ctes", "bigquery", "snowflake", "redshift"],
    "sql-product-pm": ["window functions", "cohort analysis", "retention analysis", "funnel analysis", "product analytics", "sql analytics"],
    "python-basics-pm": ["python", "scripting", "automation", "jupyter"],
    "pandas-pm": ["pandas", "numpy", "dataframe", "data analysis", "data wrangling", "data cleaning"],
    "viz-automation-pm": ["matplotlib", "data visualization", "data visualisation", "seaborn", "plotly", "automated reporting", "report automation"],
    "aiworkflow-pm": ["chatgpt", "copilot", "prompt engineering", "prompting", "ai tools", "claude", "gemini", "ai workflow", "ai-assisted"],
    "finance-pm": ["unit economics", "p&l", "pricing", "business case", "roi", "ltv", "cac", "budgeting", "forecasting", "financial modeling", "financial modelling"],
    "comm-pm": ["executive presentations", "stakeholder communication", "written communication", "public speaking", "presentations", "negotiation"],
    "metrics-pm": ["sql", "kpi", "kpis", "north star", "metrics", "analytics", "amplitude", "mixpanel",
                   "funnel", "retention", "activation", "dau", "mau", "conversion rate"],
    "discovery-pm": ["user research", "user interviews", "customer interviews", "discovery",
                     "usability", "jobs to be done", "jtbd", "persona", "personas", "voice of customer"],
    "prioritization-pm": ["roadmap", "roadmapping", "prioritization", "prioritisation", "rice",
                          "backlog", "grooming", "sprint planning", "scope"],
    "prd-pm": ["prd", "product requirements", "requirements document", "spec", "specs",
               "acceptance criteria", "user stories", "product spec"],
    "experimentation-pm": ["a/b test", "ab test", "a/b testing", "experiment", "experimentation",
                           "split test", "hypothesis", "statistical significance", "optimizely"],

    /* Business Analyst */
    "sql-ba": ["sql", "query", "queries", "reporting", "reconciliation", "data validation"],
    "requirements-ba": ["requirements", "elicitation", "user stories", "brd", "frd",
                        "traceability", "sign-off", "business requirements", "functional requirements"],
    "process-ba": ["process mapping", "bpmn", "process improvement", "as-is", "to-be",
                   "swimlane", "swimlanes", "workflow", "visio", "lucidchart", "six sigma", "lean"],
    "excel-ba": ["excel", "vlookup", "xlookup", "pivot table", "pivot tables", "spreadsheet",
                 "google sheets", "business model", "financial model"],
    "stakeholder-ba": ["stakeholder", "stakeholders", "cross-functional", "steering committee",
                       "escalation", "executive communication", "change management"],
    "foundations-ba": ["business analysis", "business analyst", "babok", "business analysis body of knowledge", "iiba", "business process analysis"],
    "strategy-ba": ["business case", "business needs", "gap analysis", "swot", "cost benefit analysis", "cost-benefit analysis", "feasibility study", "problem statement", "root cause analysis"],
    "elicitation-ba": ["elicitation", "requirements gathering", "requirements workshop", "stakeholder interviews", "interviews", "focus group", "joint application development", "jad", "brainstorming", "survey design"],
    "planning-ba": ["ba plan", "business analysis plan", "raci", "requirements management plan", "planning and monitoring"],
    "userstories-ba": ["user stories", "user story", "acceptance criteria", "use cases", "use case", "given when then", "gherkin", "story mapping", "epics"],
    "nfr-ba": ["non-functional requirements", "nonfunctional requirements", "nfr", "quality attributes", "performance requirements", "security requirements", "wcag"],
    "modeling-ba": ["uml", "data flow diagram", "dfd", "erd", "entity relationship", "use case diagram", "context diagram", "state diagram", "class diagram", "data modeling", "data modelling"],
    "rules-ba": ["business rules", "decision table", "decision tables", "decision tree", "data dictionary", "data requirements", "dmn"],
    "prototyping-ba": ["wireframe", "wireframes", "wireframing", "prototype", "prototyping", "mockup", "mockups", "figma", "balsamiq", "axure", "user flow"],
    "solution-ba": ["solution evaluation", "options analysis", "build vs buy", "vendor evaluation", "rfp", "rfi", "total cost of ownership", "tco", "weighted scoring", "solution options"],
    "traceability-ba": ["traceability", "traceability matrix", "rtm", "requirements traceability matrix", "requirements change", "change control", "baseline", "impact analysis"],
    "agile-ba": ["agile business analyst", "backlog refinement", "product backlog", "definition of ready"],
    "predictive-ba": ["waterfall", "business requirements document", "srs", "v-model", "requirements baseline"],
    "testing-ba": ["uat", "user acceptance testing", "test cases", "test plan", "defect triage", "test scenarios"],
    "implementation-ba": ["go-live", "go live", "cutover", "data migration", "benefits realization", "benefits realisation", "post-implementation review", "training plan"],
    "data-ba": ["data analysis", "descriptive statistics", "exploratory data analysis", "eda", "data cleaning", "data quality"],
    "bi-ba": ["tableau", "power bi", "powerbi", "looker", "dashboard", "dashboards", "data visualization", "data visualisation", "kpi", "business intelligence"],
    "tech-ba": ["rest api", "json", "system integration", "data pipelines", "etl"],
    "communication-ba": ["facilitation", "presentation skills", "business writing", "stakeholder communication", "executive presentation", "storytelling with data", "meeting facilitation"],
    "tools-ba": ["jira", "confluence", "visio", "lucidchart", "draw.io", "miro", "sharepoint", "azure devops", "requirements tools", "rally"],
    "ai-ba": ["generative ai", "chatgpt", "prompt engineering", "llm", "copilot", "ai tools", "ai-assisted"],
    "certs-ba": ["cbap", "ccba", "ecba", "pmi-pba", "iiba", "business analysis certification", "pba"],
    "career-ba": ["interview preparation", "case interview", "business analyst interview", "behavioral interview"],

    /* Project Manager */
    "foundations-pjm": ["project management", "project manager", "project coordinator", "project lifecycle", "project life cycle", "triple constraint", "project delivery"],
    "initiation-pjm": ["project charter", "business case", "feasibility study", "feasibility", "kickoff", "kick-off", "project initiation", "project proposal", "stakeholder identification"],
    "scope-pjm": ["scope management", "scope statement", "work breakdown structure", "wbs", "requirements gathering", "scope creep", "change control", "change request", "change requests", "project scope", "requirements traceability"],
    "schedule-pjm": ["critical path", "gantt", "gantt chart", "project schedule", "schedule management", "pert", "project timeline", "microsoft project", "ms project", "project plan", "schedule baseline", "milestone", "milestones", "dependencies"],
    "cost-pjm": ["project budget", "budget management", "cost management", "cost estimation", "earned value", "evm", "cost baseline", "budgeting", "budget tracking", "cost control", "cost variance"],
    "risk-pjm": ["risk management", "risk register", "risk assessment", "risk mitigation", "risk analysis", "contingency plan", "risk response", "risk log"],
    "quality-pjm": ["quality management", "quality assurance", "quality control", "qa", "acceptance criteria", "root cause analysis", "defect tracking", "quality plan", "uat"],
    "procurement-pjm": ["procurement", "vendor management", "vendor selection", "contract management", "rfp", "request for proposal", "supplier management", "sow", "statement of work", "outsourcing"],
    "resources-pjm": ["resource planning", "resource management", "resource allocation", "raci", "capacity planning", "team building", "staffing", "resource leveling", "resource leveling"],
    "issues-pjm": ["raid log", "issue log", "issue management", "issue tracking", "dependency management", "escalation", "decision log", "project recovery", "assumption log"],
    "tracking-pjm": ["status report", "status reporting", "progress tracking", "project tracking", "project monitoring", "project health", "rag status", "variance analysis", "stage gate", "milestone review", "project reporting"],
    "agilebasics-pjm": ["agile", "agile methodology", "agile project management", "agile transformation", "user stories", "story points", "velocity", "product backlog", "safe", "pmi-acp"],
    "scrum-pjm": ["scrum", "scrum master", "sprint planning", "sprint review", "sprint retrospective", "daily standup", "stand-up", "sprint", "sprints", "psm", "csm", "burndown"],
    "kanban-pjm": ["kanban", "wip limit", "wip limits", "lean", "cycle time", "lead time", "throughput", "continuous improvement", "kaizen", "value stream"],
    "scaling-pjm": ["release planning", "program increment", "scaled agile", "safe", "scrum of scrums", "cross-team", "multi-team", "roadmap", "program management", "dependency mapping"],
    "hybrid-pjm": ["hybrid", "hybrid methodology", "hybrid approach", "waterfall", "waterfall and agile", "predictive", "tailoring", "prince2", "stage-gate"],
    "release-pjm": ["release management", "go-live", "go live", "cutover", "deployment", "rollout", "hypercare", "post-implementation review", "release planning", "rollback"],
    "stakeholders-pjm": ["stakeholder management", "stakeholder engagement", "stakeholder analysis", "stakeholder register", "stakeholder communication", "sponsor management", "executive stakeholders", "expectation management"],
    "communication-pjm": ["communication plan", "status updates", "executive updates", "steering committee", "project communication", "reporting to executives", "executive reporting", "presentations", "written communication"],
    "leadership-pjm": ["team leadership", "led a team", "leading teams", "cross-functional team", "cross-functional teams", "influence without authority", "conflict resolution", "coaching", "mentoring", "servant leadership"],
    "negotiation-pjm": ["negotiation", "negotiated", "vendor negotiation", "contract negotiation", "trade-off", "trade-offs", "influence", "conflict management"],
    "meetings-pjm": ["facilitation", "facilitated", "workshop", "workshops", "meeting facilitation", "retrospective", "retrospectives", "minutes", "agenda"],
    "change-pjm": ["change management", "organizational change", "adoption", "user adoption", "training", "kotter", "adkar", "lessons learned", "project closure", "project close-out", "handover"],
    "tools-pjm": ["jira", "asana", "smartsheet", "microsoft project", "ms project", "trello", "monday.com", "clickup", "confluence", "ms planner", "basecamp", "wrike", "primavera"],
    "reporting-pjm": ["dashboard", "dashboards", "kpi", "kpis", "power bi", "tableau", "excel", "project dashboard", "s-curve", "burn chart", "metrics", "reporting"],
    "ai-pjm": ["chatgpt", "copilot", "claude", "gemini", "prompt engineering", "ai tools", "ai-assisted", "generative ai", "ai workflow"],
    "portfolio-pjm": ["pmo", "project management office", "portfolio management", "program manager", "program management", "benefits realization", "governance", "project portfolio", "prioritization"],
    "career-pjm": ["pmp", "capm", "pmi-acp", "prince2 practitioner", "project management professional", "certified scrum master", "project manager interview"]

  };


  /* What a resume says, as opposed to what the four roadmaps teach. A product manager
     writes "agile", "go-to-market" and "Jira", none of which is a course module, so
     matching only the module vocabulary made a real PM resume look empty. These groups
     are read on the device and shown back as the skills found. */
  window.CP_GENERAL_TERMS = {
    "Product": ["product strategy", "product roadmap", "roadmap", "go-to-market", "gtm", "product launch",
                "product lifecycle", "mvp", "okr", "wireframe", "figma", "prototype", "prototyping",
                "user research", "user stories", "prd", "customer feedback", "market research",
                "competitive analysis", "product discovery", "feature prioritization", "prioritization",
                "acceptance criteria", "a/b testing", "product requirements", "user experience", "ux"],
    "Delivery": ["agile", "scrum", "kanban", "sprint", "sprints", "jira", "confluence", "asana",
                 "program management", "project management", "risk management", "release planning",
                 "stakeholder management", "stakeholder", "cross-functional", "milestone", "raci",
                 "backlog", "retrospective", "dependency management", "timeline", "budget",
                 "pmp", "capm", "gantt", "critical path", "work breakdown structure", "wbs", "project charter",
                 "earned value", "risk register", "change control", "pmo", "waterfall", "prince2",
                 "microsoft project", "smartsheet", "status report", "project plan", "resource planning",
                 "go-live", "vendor management", "project scope"],
    "Technical": ["api", "rest api", "machine learning", "nlp", "llm", "rag", "generative ai", "chatbot",
                  "voice bot", "conversational ai", "dialogflow", "aws", "gcp", "azure", "cloud",
                  "microservices", "ci/cd", "salesforce", "python", "java", "javascript", "git",
                  "system design", "architecture", "integration", "automation"],
    "Data": ["sql", "bigquery", "snowflake", "tableau", "power bi", "looker", "excel", "pandas",
             "analytics", "dashboard", "kpi", "metrics", "funnel", "retention", "statistics",
             "etl", "data analysis", "data pipeline", "a/b test", "experimentation"],
    "Business": ["revenue", "pricing", "p&l", "forecasting", "financial modeling", "operations",
                 "supply chain", "vendor management", "negotiation", "business strategy",
                 "customer success", "sales", "partnerships", "process improvement", "cost reduction",
                 "inventory", "distribution", "consulting"]
  };

  /* How strongly each group points at each roadmap. Only used by the rule-based ranking
     and as context for the model; it never decides anything alone. */
  window.CP_GENERAL_ROLE = {
    "Product":   { pm: 1.0, ba: 0.4, pjm: 0.1 },
    "Delivery":  { pm: 0.5, ba: 0.5, pjm: 1.0 },
    "Technical": { pm: 0.4, ba: 0.3, pjm: 0.2 },
    "Data":      { pm: 0.3, ba: 0.5, pjm: 0.1 },
    "Business":  { pm: 0.3, ba: 0.7, pjm: 0.4 }
  };

  window.CP_ROLE_TERMS = {
    pm: ["product manager", "product management", "associate product manager", "apm",
         "product owner", "pm intern", "product operations", "product analyst",
         "technical program manager", "tpm"],
    ba: ["business analyst", "business analysis", "systems analyst", "business systems",
         "process analyst", "operations analyst", "requirements analyst", "functional analyst"],
    pjm: ["project manager", "project management", "project coordinator", "project lead",
          "program manager", "technical program manager", "tpm", "scrum master", "delivery manager",
          "project management office", "pmo analyst", "project analyst", "pmp"]
  };

  /* Guided questions: five, none with a right answer.

     They only run when a student says they want help choosing. Each option names no
     role, so a visible label cannot turn the test into a form where people pick the role
     they already had in mind. Every option carries a weight of 3 towards the roadmap it
     points at, and sometimes a smaller 1 towards a neighbour it genuinely overlaps with
     (Business Analyst sits between Product and Project Manager), so a mixed person gets
     graded scores instead of 100 / 0 / 0.

     The set is written for the three roadmaps: pm (Product Manager), ba (Business Analyst)
     and pjm (Project Manager).

     Checked with 22 role-played personas (all 22 scored to the intended role, and an
     independent model reading only the answers agreed on all 22), and with 20,000
     simulated people whose answers are inconsistent: 94% top-1 at 7 of 10 answers
     matching their role, 85% at 6 of 10, 74% at 5 of 10. */
  window.CP_GUIDED = [
    {
      pid: "g1", kind: "you",
      q: "Which kind of work sounds most satisfying to you?",
      opts: [
        { t: "Deciding what to build, and why it matters to customers", w: { pm: 3, ba: 1 } },
        { t: "Working out what a business really needs and writing it down clearly", w: { ba: 3, pm: 1 } },
        { t: "Getting a complicated piece of work finished on time, with everyone clear on their part", w: { pjm: 3 } },
      ]
    },
    {
      pid: "g2", kind: "you",
      q: "A piece of work is falling behind and the people involved disagree about what matters most. What do you do first?",
      opts: [
        { t: "Reset the schedule, name who owns what, and list what could still go wrong", w: { pjm: 3 } },
        { t: "Decide what customers need most and drop the rest", w: { pm: 3, ba: 1 } },
        { t: "Meet each group to find out what they really need and where their requests clash", w: { ba: 3, pm: 1, pjm: 1 } }
      ]
    },
    {
      pid: "g3", kind: "you",
      q: "Which would you most like to be known for?",
      opts: [
        { t: "Making sure the solution fits the problem the business actually has", w: { ba: 3, pm: 1 } },
        { t: "Always delivering what was promised, when it was promised", w: { pjm: 3 } },
        { t: "Choosing the right thing to build, and building it for the right people", w: { pm: 3, ba: 1 } }
      ]
    },
    {
      pid: "g4", kind: "you",
      q: "Which of these would you be happiest to own at work?",
      opts: [
        { t: "A plan for where a product should go over the next year", w: { pm: 3, ba: 1 } },
        { t: "A schedule with owners, deadlines and a list of risks", w: { pjm: 3, ba: 1 } },
        { t: "A clear document or diagram of how a process works and what should change", w: { ba: 3, pjm: 1 } }
      ]
    },
    {
      pid: "g5", kind: "you",
      q: "A decision is due and some information is missing. What feels most natural?",
      opts: [
        { t: "Keep asking questions until the picture is clear", w: { ba: 3 } },
        { t: "Break the work into steps and set checkpoints, so surprises show up early", w: { pjm: 3, ba: 1 } },
        { t: "Make a call with what I have, then learn from what happens", w: { pm: 3, pjm: 1 } },
      ]
    }
  ];

  /* Roadmaps that exist in the product plan but not yet in CP_ROLES. If a student's answers
     point most strongly at one of these, the page says so instead of quietly ranking a
     weaker fit first. Empty now that all three roadmaps ship. */
  window.CP_PLANNED_ROLES = {};

  /* Weekly challenges. Each carries its own rubric, which does double duty: it is
     the instruction given to the AI reviewer, and the offline check when no model
     is reachable. Status follows the same discipline as assessment questions:
     nothing scored goes live without a publish step. */
  window.CP_CHALLENGES = [
    /* Week 1 is deliberately easy: one realistic situation from the first module of each roadmap, answerable in a few
       sentences, so a student's first attempt feels doable. The harder challenges follow in later weeks. */
    {
      cid: "pm-start", roleId: "pm", week: 1, status: "live", minWords: 40,
      title: "Pick the one thing to build",
      brief: "You are the product manager of a note-taking app. Three requests came in this month: " +
        "(1) dark mode, which 120 users asked for; (2) export to PDF, which 45 users asked for, mostly paying customers; " +
        "(3) a better first-day tutorial, because 60% of new users leave on day 1. " +
        "There is time to build only one this sprint. Which one would you build, and why? " +
        "Answer in 3 to 5 sentences, and say which number you would check after launch to see if it worked.",
      rubric: [
        { label: "Picks one option clearly" },
        { label: "Ties the choice to a user problem or a number from the list" },
        { label: "Says why the other options wait" },
        { label: "Names a success measure to check after launch" }
      ]
    },
    {
      cid: "ba-start", roleId: "ba", week: 1, status: "live", minWords: 15,
      title: "Top sellers last month",
      brief: "A store manager asks for the 3 best-selling products last month. You have one table, " +
        "orders(order_id, order_date, product, quantity). Write the SQL query that answers it. " +
        "If you prefer, describe each step in words instead.",
      rubric: [
        { label: "Adds up the quantity sold" },
        { label: "Filters to last month's dates" },
        { label: "Groups by product" },
        { label: "Sorts from highest to lowest" },
        { label: "Limits the result to 3" }
      ]
    },
    {
      cid: "pjm-start", roleId: "pjm", week: 1, status: "live", minWords: 40,
      title: "Plan a customer webinar",
      brief: "You are running a customer webinar and have these tasks: book the webinar platform (1 day); " +
        "write the slides (3 days); send invitations (2 days, after the platform is booked); " +
        "rehearse (1 day, after the slides are done). " +
        "Which tasks can run at the same time? What is the shortest time before the webinar can be held? " +
        "Name one risk and how you would handle it.",
      rubric: [
        { label: "Says the platform and the slides can start together" },
        { label: "Gets the shortest time right: 4 days" },
        { label: "Explains that slides then rehearsal is the longest path" },
        { label: "Names a risk" },
        { label: "Says how the risk would be handled" }
      ]
    },
    {
      cid: "pm-w1", roleId: "pm", week: 3, status: "draft", minWords: 90,
      title: "Diagnose a drop in week-one retention",
      brief: "Week-one retention for a note-taking app fell from 42% to 31% over six weeks. " +
        "Signups are flat and no release went out in that window. Write how you would find the cause. " +
        "Name the first three things you would look at, in order, and say what each one would rule in or out.",
      rubric: [
        { label: "Segments the drop rather than treating it as one number" },
        { label: "Checks acquisition mix as an explanation" },
        { label: "Considers instrumentation or tracking error before product causes" },
        { label: "States what each check would rule in or out" },
        { label: "Gives an ordered plan rather than a list of ideas" }
      ]
    },
    {
      cid: "pm-w2", roleId: "pm", week: 2, status: "draft", minWords: 90,
      title: "Write the guardrail metrics for a paywall test",
      brief: "Your team wants to test moving the paywall from day 14 to day 7. Define the primary metric, " +
        "two guardrail metrics, and the result that would make you ship despite a fall in one of them.",
      rubric: [
        { label: "Names one primary metric, not several" },
        { label: "Guardrails protect against a known side effect" },
        { label: "States a decision rule before seeing the data" },
        { label: "Acknowledges a trade-off rather than claiming a pure win" }
      ]
    },
    {
      cid: "ba-w1", roleId: "ba", week: 3, status: "draft", minWords: 90,
      title: "Turn a vague request into testable requirements",
      brief: "A regional manager asks for \"a report that shows how the branches are doing, updated often.\" " +
        "Write the questions you would ask to make that buildable, then write three requirements that a " +
        "developer could implement and a tester could verify.",
      rubric: [
        { label: "Asks who the report is for and what decision it drives" },
        { label: "Pins down \"how the branches are doing\" to named measures" },
        { label: "Pins down \"updated often\" to a frequency or latency" },
        { label: "Requirements are verifiable rather than aspirational" },
        { label: "Covers access or permissions" }
      ]
    },
    {
      cid: "ba-w2", roleId: "ba", week: 2, status: "draft", minWords: 80,
      title: "Find the bottleneck in an as-is process",
      brief: "Purchase orders take eleven days from request to approval. Four teams touch the request. " +
        "Describe how you would map the as-is process and identify where the eleven days actually go.",
      rubric: [
        { label: "Measures time per step rather than guessing" },
        { label: "Separates work time from wait time" },
        { label: "Names who owns each step" },
        { label: "Proposes a to-be change tied to the measured bottleneck" }
      ]
    },
    {
      cid: "pjm-w1", roleId: "pjm", week: 3, status: "draft", minWords: 90,
      title: "Find the critical path and say what to protect",
      brief: "A six-activity project has these durations and dependencies: A (3 days, no predecessor), B (4 days, after A), " +
        "C (2 days, after A), D (5 days, after B), E (3 days, after C), F (2 days, after D and E). " +
        "Work out the critical path and the project length, say how much float activity E has, and explain what you would watch most closely.",
      rubric: [
        { label: "Identifies the critical path A, B, D, F" },
        { label: "States the project duration of 14 days" },
        { label: "Explains float for the non-critical path" },
        { label: "Says delays on the critical path delay the whole project" },
        { label: "Names what to monitor or protect" }
      ]
    },
    {
      cid: "pjm-w2", roleId: "pjm", week: 2, status: "draft", minWords: 90,
      title: "Report a project that is behind and over budget",
      brief: "Halfway through a 20-week project, planned value is 100,000 USD, earned value is 80,000 USD and actual cost is 95,000 USD. " +
        "Calculate the schedule and cost performance indexes, explain them in plain English and tell your sponsor what you recommend.",
      rubric: [
        { label: "Calculates SPI as 0.8 and CPI as about 0.84" },
        { label: "Explains behind schedule and over budget in plain English" },
        { label: "Forecasts the outcome rather than only reporting it" },
        { label: "Recommends a concrete action" },
        { label: "Asks the sponsor for a decision" }
      ]
    }
  ];
})();
