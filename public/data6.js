/* Onboarding vocabulary and weekly challenge content.

   CP_SKILL_TERMS  what a resume has to mention for a skill to count as claimed.
   CP_ROLE_TERMS   phrases that point at a whole roadmap rather than one skill.
   CP_CHALLENGES   the weekly challenge library, one set per roadmap.

   Terms are lowercase and matched with word boundaries, so "r" or "ml" never
   match inside a longer word. */
(function () {
  "use strict";

  window.CP_SKILL_TERMS = {
    /* Product Manager */
    "sql-pm": ["sql", "query", "queries", "bigquery", "snowflake", "redshift", "postgres", "mysql"],
    "metrics-pm": ["kpi", "kpis", "north star", "metrics", "analytics", "amplitude", "mixpanel",
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

    /* Data Analyst */
    "sql-da": ["sql", "window function", "window functions", "cte", "ctes", "joins",
               "query optimization", "query performance"],
    "stats-da": ["statistics", "statistical", "regression", "hypothesis testing", "p-value",
                 "confidence interval", "inference", "significance", "correlation"],
    "viz-da": ["tableau", "power bi", "powerbi", "looker", "data studio", "dashboard", "dashboards",
               "visualization", "visualisation", "charts", "reporting dashboard", "qlik"],
    "python-da": ["python", "pandas", "numpy", "jupyter", "notebook", "matplotlib", "seaborn",
                  "scikit", "sklearn"],
    "cleaning-da": ["data cleaning", "data quality", "etl", "data wrangling", "data pipeline",
                    "deduplication", "missing data", "outliers", "data validation"],

    /* Financial Analyst */
    "modeling-fa": ["financial modeling", "financial modelling", "three-statement", "3-statement",
                    "income statement", "balance sheet", "cash flow", "p&l", "pnl"],
    "valuation-fa": ["valuation", "dcf", "discounted cash flow", "wacc", "comparable companies",
                     "comps", "terminal value", "ebitda multiple", "equity research"],
    "excel-fa": ["excel", "sensitivity analysis", "scenario analysis", "data tables", "vba",
                 "macros", "goal seek", "what-if"],
    "variance-fa": ["variance analysis", "budget vs actual", "budgeting", "forecasting", "fp&a",
                    "fpa", "cost accounting", "budget", "forecast"],
    "sql-fa": ["sql", "general ledger", "gl", "erp", "sap", "netsuite", "quickbooks",
               "month-end close", "audit trail"]
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
                 "backlog", "retrospective", "dependency management", "timeline", "budget"],
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
    "Product":   { pm: 1.0, ba: 0.4, da: 0.1, fa: 0.0 },
    "Delivery":  { pm: 0.7, ba: 0.6, da: 0.1, fa: 0.1 },
    "Technical": { pm: 0.4, ba: 0.3, da: 0.5, fa: 0.1 },
    "Data":      { pm: 0.3, ba: 0.4, da: 1.0, fa: 0.3 },
    "Business":  { pm: 0.3, ba: 0.6, da: 0.2, fa: 0.8 }
  };

  window.CP_ROLE_TERMS = {
    pm: ["product manager", "product management", "associate product manager", "apm",
         "technical program manager", "program manager", "tpm", "product owner", "pm intern",
         "product operations", "product analyst"],
    ba: ["business analyst", "business analysis", "systems analyst", "business systems",
         "process analyst", "operations analyst"],
    da: ["data analyst", "data analytics", "analytics engineer", "business intelligence",
         "bi analyst", "data scientist"],
    fa: ["financial analyst", "finance", "investment banking", "equity research", "fp&a",
         "corporate finance", "treasury", "accounting"]
  };

  /* Placement questions.

     Deliberately not a skills test. Asking a stranger to write SQL before they have
     picked a roadmap filters out exactly the people the recommendation is for, and it
     makes the product impossible to demonstrate to someone who is not already an
     analyst. These are eight plain questions anyone can answer in under a minute.

     There is no right answer and no score. Each option carries weights towards the
     roadmaps it points at, and the sum of those weights is one of the three inputs to
     the ranking. Nothing in the interface tells the student which roadmap an option
     favours, because a visible label turns the test into a form where people pick the
     role they already had in mind. */
  window.CP_PLACEMENT = [
    {
      pid: "p1", kind: "you",
      q: "A project you are on is going badly. Which part would you most want to be the one to fix?",
      opts: [
        { t: "Deciding what gets built next, and why", w: { pm: 3 } },
        { t: "Writing down what the business actually needs so the team can build it", w: { ba: 3 } },
        { t: "Working out what the numbers are really saying", w: { da: 3 } },
        { t: "Checking whether the money adds up", w: { fa: 3 } }
      ]
    },
    {
      pid: "p3", kind: "you",
      q: "A report says sales are up 10 percent but profit is down. What would you ask first?",
      opts: [
        { t: "Are we discounting more than we used to?", w: { fa: 3, da: 1 } },
        { t: "Which customers are doing the buying?", w: { pm: 2, da: 1 } },
        { t: "Is the report itself right?", w: { ba: 2, da: 2 } },
        { t: "What does the sales team think is going on?", w: { ba: 2, pm: 1 } }
      ]
    },
    {
      pid: "p4", kind: "you",
      q: "You get one hour with a customer. What do you spend it on?",
      opts: [
        { t: "Understanding the problem they are trying to solve", w: { pm: 3 } },
        { t: "Writing down every step of how they work today", w: { ba: 3 } },
        { t: "Getting their data so you can look at it yourself", w: { da: 3 } },
        { t: "Understanding how they make their money", w: { fa: 3 } }
      ]
    },
    {
      pid: "p5", kind: "you",
      q: "Which of these sounds most like something you would say?",
      opts: [
        { t: "Let us not build that yet", w: { pm: 3 } },
        { t: "Let us agree what done means first", w: { ba: 3 } },
        { t: "That average is hiding something", w: { da: 3 } },
        { t: "What is the assumption behind that number?", w: { fa: 3 } }
      ]
    },
    {
      pid: "p6", kind: "you",
      q: "Half the people who start signing up never finish. What do you look at first?",
      opts: [
        { t: "Exactly where they stop", w: { da: 3, pm: 1 } },
        { t: "What the form is asking them for", w: { pm: 2, ba: 2 } },
        { t: "Whether something is broken on phones", w: { ba: 3 } },
        { t: "Whether this matters more than everything else on the list", w: { pm: 3 } }
      ]
    },
    {
      pid: "p8", kind: "you",
      q: "Which would annoy you most?",
      opts: [
        { t: "Shipping something nobody wanted", w: { pm: 3 } },
        { t: "Building the wrong thing because the spec was vague", w: { ba: 3 } },
        { t: "A number in a deck that nobody can trace", w: { da: 3 } },
        { t: "A model whose assumptions nobody wrote down", w: { fa: 3 } }
      ]
    }
  ];

  /* Four applied questions, mixed in with the six above. These do have a best answer,
     and the question says so, because a test that silently switches between "what
     would you do" and "which is right" is confusing to answer.

     Applied does not mean technical jargon. Every one of these is arithmetic or plain
     reasoning a first-year student can do, which is the point: they separate people by
     how they think, not by what tool they have already learned. */
  window.CP_PLACEMENT_APPLIED = [
    {
      pid: "a1", kind: "best", best: 1,
      q: "A shop sold 100 items last month at $10 each. This month it sold 80 items at $15 each. What happened to revenue?",
      opts: [
        { t: "It fell", w: {} },
        { t: "It rose", w: { fa: 3, da: 2 } },
        { t: "It stayed about the same", w: {} },
        { t: "There is not enough information", w: {} }
      ]
    },
    {
      pid: "a2", kind: "best", best: 1,
      q: "You ask 10 customers and 7 say they want a feature. What can you safely conclude?",
      opts: [
        { t: "Most customers want it", w: {} },
        { t: "7 of those 10 customers said they want it", w: { da: 3, pm: 2 } },
        { t: "70 percent of the market wants it", w: {} },
        { t: "The feature will succeed", w: {} }
      ]
    },
    {
      pid: "a3", kind: "best", best: 0,
      q: "A process has five steps. Steps 1 to 4 take an hour each and step 5 takes six hours. Where do you look first to make the whole thing faster?",
      opts: [
        { t: "Step 5", w: { ba: 3, da: 1 } },
        { t: "Step 1, because it sets up everything after it", w: {} },
        { t: "Spread the work evenly across all five", w: {} },
        { t: "Shave time off every step equally", w: {} }
      ]
    },
    {
      pid: "a4", kind: "best", best: 1,
      q: "Two teams report different revenue figures for the same month. What do you check first?",
      opts: [
        { t: "Which team is usually more reliable", w: {} },
        { t: "Whether they are counting the same thing", w: { ba: 3, fa: 3 } },
        { t: "Take the average of the two", w: {} },
        { t: "Ask finance to decide which one to use", w: {} }
      ]
    }
  ];

  /* Weekly challenges. Each carries its own rubric, which does double duty: it is
     the instruction given to the AI reviewer, and the offline check when no model
     is reachable. Status follows the same discipline as assessment questions:
     nothing scored goes live without a publish step. */
  window.CP_CHALLENGES = [
    {
      cid: "pm-w1", roleId: "pm", week: 1, status: "live", minWords: 90,
      title: "Diagnose a drop in week-one retention",
      brief: "Week-one retention for a note-taking app fell from 42% to 31% over six weeks. " +
        "Signups are flat and no release went out in that window. Write how you would find the cause. " +
        "Name the first three things you would look at, in order, and say what each one would rule in or out.",
      rubric: [
        { label: "Segments the drop rather than treating it as one number",
          re: "segment|cohort|breakdown|by platform|by channel|by device|slice" },
        { label: "Checks acquisition mix as an explanation",
          re: "channel|acquisition|source|paid|organic|traffic mix|marketing" },
        { label: "Considers instrumentation or tracking error before product causes",
          re: "instrument|tracking|logging|event|analytics break|data quality|pipeline" },
        { label: "States what each check would rule in or out",
          re: "rule out|rule in|if .*then|would tell|confirm|eliminate|distinguish" },
        { label: "Gives an ordered plan rather than a list of ideas",
          re: "first|second|third|then|next|start by|order" }
      ]
    },
    {
      cid: "pm-w2", roleId: "pm", week: 2, status: "draft", minWords: 90,
      title: "Write the guardrail metrics for a paywall test",
      brief: "Your team wants to test moving the paywall from day 14 to day 7. Define the primary metric, " +
        "two guardrail metrics, and the result that would make you ship despite a fall in one of them.",
      rubric: [
        { label: "Names one primary metric, not several", re: "primary metric|north star|primary:" },
        { label: "Guardrails protect against a known side effect",
          re: "guardrail|churn|uninstall|refund|support ticket|nps|retention" },
        { label: "States a decision rule before seeing the data",
          re: "ship if|decision rule|threshold|would ship|stop if|only if" },
        { label: "Acknowledges a trade-off rather than claiming a pure win",
          re: "trade-?off|accept|worth|cost of|even if|despite" }
      ]
    },
    {
      cid: "ba-w1", roleId: "ba", week: 1, status: "live", minWords: 90,
      title: "Turn a vague request into testable requirements",
      brief: "A regional manager asks for \"a report that shows how the branches are doing, updated often.\" " +
        "Write the questions you would ask to make that buildable, then write three requirements that a " +
        "developer could implement and a tester could verify.",
      rubric: [
        { label: "Asks who the report is for and what decision it drives",
          re: "who |audience|decision|use it|purpose|act on" },
        { label: "Pins down \"how the branches are doing\" to named measures",
          re: "metric|measure|revenue|volume|target|kpi|define" },
        { label: "Pins down \"updated often\" to a frequency or latency",
          re: "daily|hourly|weekly|real.?time|refresh|latency|frequency|sla" },
        { label: "Requirements are verifiable rather than aspirational",
          re: "shall|must|given|when |then |acceptance|verif|testable|criteria" },
        { label: "Covers access or permissions", re: "permission|access|role|who can see|security|confidential" }
      ]
    },
    {
      cid: "ba-w2", roleId: "ba", week: 2, status: "draft", minWords: 80,
      title: "Find the bottleneck in an as-is process",
      brief: "Purchase orders take eleven days from request to approval. Four teams touch the request. " +
        "Describe how you would map the as-is process and identify where the eleven days actually go.",
      rubric: [
        { label: "Measures time per step rather than guessing",
          re: "cycle time|timestamp|measure|duration|time per|log|data" },
        { label: "Separates work time from wait time", re: "wait|queue|idle|handoff|hand-off|delay|touch time" },
        { label: "Names who owns each step", re: "swimlane|owner|role|responsib|raci|team" },
        { label: "Proposes a to-be change tied to the measured bottleneck",
          re: "to-?be|remove|parallel|automate|threshold|delegate|combine" }
      ]
    },
    {
      cid: "da-w1", roleId: "da", week: 1, status: "live", minWords: 80,
      title: "Explain a suspicious average",
      brief: "A dashboard reports average order value up 18% month over month, but revenue is flat and " +
        "order count is down 20%. Explain what is most likely happening and what you would check to confirm it.",
      rubric: [
        { label: "Recognises the mix shift rather than treating AOV as growth",
          re: "mix|composition|fewer|small orders|distribution|denominator|skew" },
        { label: "Checks the distribution, not just the mean",
          re: "median|percentile|distribution|histogram|outlier|p50|spread" },
        { label: "Connects the three numbers arithmetically",
          re: "revenue *[/=]|divided by|aov *=|order count|arithmetic|consistent" },
        { label: "Proposes a concrete verification step",
          re: "segment|group by|check|query|compare|cohort|break down" }
      ]
    },
    {
      cid: "da-w2", roleId: "da", week: 2, status: "draft", minWords: 80,
      title: "Choose the chart and defend it",
      brief: "You have monthly active users for six products over three years and one question: which products " +
        "are losing momentum? Say what you would plot, what you would leave out, and why.",
      rubric: [
        { label: "Picks a form that shows change over time", re: "line|trend|slope|time series|over time" },
        { label: "Handles six series without making it unreadable",
          re: "small multiple|facet|highlight|grey|gray|annotate|limit|top" },
        { label: "Considers indexing or normalising different scales",
          re: "index|normali|percent change|log|relative|rebase|scale" },
        { label: "Says what is deliberately left out", re: "leave out|omit|exclude|not show|avoid|drop" }
      ]
    },
    {
      cid: "fa-w1", roleId: "fa", week: 1, status: "live", minWords: 90,
      title: "Defend one assumption in a DCF",
      brief: "Your DCF values a mature consumer goods business at 14x EBITDA, against a comparables median of 9x. " +
        "The gap comes mostly from your terminal growth rate. Defend or revise that assumption.",
      rubric: [
        { label: "States the terminal growth rate used and its basis",
          re: "terminal growth|perpetuity|g *=|growth rate of|long.?term growth" },
        { label: "Sanity-checks it against GDP or inflation",
          re: "gdp|inflation|nominal|real growth|economy|2%|3%" },
        { label: "Shows what the value does when the assumption moves",
          re: "sensitivit|if .*instead|basis point|falls to|scenario|range" },
        { label: "Reconciles the DCF against the comps rather than ignoring them",
          re: "comps|multiple|implied|bridge|reconcil|cross-?check|9x|median" },
        { label: "Reaches a defensible conclusion either way",
          re: "therefore|conclude|i would|revise|stand by|defensible|recommend" }
      ]
    },
    {
      cid: "fa-w2", roleId: "fa", week: 2, status: "draft", minWords: 80,
      title: "Break a variance into price, volume and mix",
      brief: "Revenue came in 6% under budget. Units were 2% over. Explain how you would split the variance " +
        "into price, volume and mix, and what each part would tell the business to do differently.",
      rubric: [
        { label: "Separates the three effects rather than blending them",
          re: "price variance|volume variance|mix|decompos|split|isolate" },
        { label: "Holds one factor constant at a time",
          re: "hold|constant|budget price|actual volume|at budget|ceteris|keeping" },
        { label: "Notices units up while revenue down implies price or mix",
          re: "price fell|discount|lower price|mix shift|cheaper|downgrade|shifted" },
        { label: "Ties each part to a different owner or action",
          re: "sales|pricing|marketing|action|owner|recommend|team" }
      ]
    }
  ];
})();
