/* Business Analyst track. */

window.CP_ROLES.push(
  {
    id: "ba",
    name: "Business Analyst",
    tagline: "Turn messy business reality into requirements people can build.",
    skills: [
      {
        id: "sql-ba",
        name: "SQL for Business Analysts",
        lens: "Reporting, reconciliation, data validation, operational analysis",
        summary: "The BA lens on SQL is correctness, not exploration. You are producing numbers that go into decisions and reports, so joins that silently duplicate rows and nulls that swallow records are the whole game.",
        lessons: [
          {
            title: "Joins that quietly change your numbers",
            body: "The single most expensive SQL error in business reporting is a join that multiplies rows. You join orders to order_items to get product detail, and your revenue total triples, because each order now appears once per line item.\n\nThe defensive habit: before trusting any joined result, check the row count against the unjoined base table. If orders has 10,000 rows and your joined result has 31,000, you have a fan-out, and any SUM over that result is wrong.\n\nThe fix depends on the question. If you want revenue per order, aggregate order_items to one row per order first, then join. If you want line-level detail, do not SUM order-level fields over it. Knowing which of these you want is the analysis, and the SQL follows."
          },
          {
            title: "Nulls, and why your totals do not reconcile",
            body: "Null is not zero and it is not an empty string. It is the absence of a value, and it propagates: any arithmetic involving null returns null, and any comparison to null returns unknown rather than true or false.\n\nThe practical consequences bite constantly. WHERE status != 'cancelled' silently excludes every row where status is null, which is usually not what you meant. SUM ignores nulls, so a sum over a column with missing values produces a number that looks fine and understates reality. And an INNER JOIN on a nullable key drops rows that have no match, which is how a reconciliation ends up 4% short with no error anywhere.\n\nUse COALESCE deliberately, use IS NULL rather than = NULL, and when a total does not reconcile, check the null handling before anything else."
          },
          {
            title: "Validating a report before you send it",
            body: "A BA's credibility is built on numbers that hold up. Four checks catch most errors and take five minutes.\n\nRow count against the source. Totals against a known reference, such as the finance system or last period's report. Grain check: is each row the thing you think it is, or did a join change the grain underneath you. And boundary check: does the date filter use the intended inclusive or exclusive endpoints, since BETWEEN on a timestamp column silently drops everything after midnight on the last day.\n\nThen document the definition alongside the number. 'Active accounts: 4,182' invites a dispute. 'Active accounts (logged in at least once in the trailing 30 days, excluding internal domains and test accounts): 4,182' ends one."
          }
        ],
        practice: [
          {
            prompt: "Your revenue report shows $2.1M. Finance says $1.94M. Where do you look first?",
            answer: "Start with grain and scope, not with the numbers. Check whether a join fanned out rows and inflated the sum. Then check date boundaries, including timezone and whether the period is inclusive of the last day. Then check scope differences: refunds, cancelled orders, internal accounts, and tax or shipping inclusion. Nearly every reconciliation gap is one of those four, and the gap here is about 8%, which is consistent with refunds or a fan-out on a subset."
          },
          {
            prompt: "Why might WHERE region != 'West' return fewer rows than you expect?",
            answer: "Rows where region is null are excluded, because comparing null to anything yields unknown rather than true. If you want those rows, write WHERE region IS DISTINCT FROM 'West', or WHERE (region != 'West' OR region IS NULL). This is one of the most common silent data-loss bugs in business reporting."
          }
        ],
        quiz: [
          { q: "Your joined result has three times the rows of the base table. This indicates:", opts: ["A performance problem", "A fan-out, so any SUM over it is inflated", "Missing indexes", "Duplicate source data"], a: 1, why: "A one-to-many join multiplies base rows, silently multiplying every aggregate computed over them." },
          { q: "SUM over a column containing nulls will:", opts: ["Return null", "Throw an error", "Ignore the nulls and understate the true total if they should have been zeros", "Treat nulls as zero explicitly"], a: 2, why: "SUM skips nulls. The result looks valid but excludes those records entirely." },
          { q: "BETWEEN '2026-09-01' AND '2026-09-30' on a timestamp column:", opts: ["Includes all of September", "Excludes everything after midnight on Sept 30", "Is equivalent to >= and <", "Fails on timestamps"], a: 1, why: "The endpoint resolves to midnight, so a full final day of activity is silently dropped." }
        ],
        assessment: [
          { lvl: 1, q: "Which comparison correctly finds rows with a missing value?", opts: ["WHERE col = NULL", "WHERE col IS NULL", "WHERE col = ''", "WHERE col != col"] },
          { lvl: 1, q: "You need totals per region. The correct clause is:", opts: ["ORDER BY region", "GROUP BY region", "PARTITION BY region", "DISTINCT region"] },
          { lvl: 2, q: "A LEFT JOIN from customers to orders, filtered with WHERE orders.status = 'complete', behaves like:", opts: ["A LEFT JOIN", "An INNER JOIN, because the WHERE clause removes the null-extended rows", "A CROSS JOIN", "A FULL OUTER JOIN"] },
          { lvl: 2, q: "Your report must exclude test accounts. The most maintainable approach is:", opts: ["Hardcode the account IDs in every query", "Maintain an exclusion flag or reference table applied consistently", "Filter manually in Excel afterward", "Sort them to the bottom"] },
          { lvl: 3, q: "Order revenue triples after joining order_items. The correct fix when you want revenue per order is:", opts: ["Use SELECT DISTINCT", "Aggregate order_items to one row per order before joining", "Divide the total by three", "Switch to a LEFT JOIN"] },
          { lvl: 3, q: "Two reports disagree on active users by 6%. The most efficient first step is:", opts: ["Rebuild both queries", "Compare the two definitions and their filters line by line", "Ask the data team", "Take the average"] },
          { lvl: 4, q: "You need the most recent status per account from a status history table. The cleanest approach is:", opts: ["MAX(status)", "ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY changed_at DESC) and filter to 1", "SELECT DISTINCT ON status", "GROUP BY account_id, status"] },
          { lvl: 4, q: "A monthly report is correct in aggregate but wrong for the final two days each month. The most likely cause is:", opts: ["Source data lag", "A timezone or inclusive-endpoint boundary error in the date filter", "Join fan-out", "Null handling"] },
          { lvl: 5, q: "Stakeholders keep re-deriving your numbers and getting different answers. The durable fix is:", opts: ["Send the raw data", "Publish the metric definition, the query, and the exclusions alongside the number, with one owner", "Lock the report", "Add more charts"] },
          { lvl: 5, q: "A query that takes 40 minutes must run daily. Before asking for more hardware, the highest-value check is:", opts: ["Adding DISTINCT", "Whether filters are applied before joins and whether the query scans partitions it does not need", "Rewriting in Python", "Increasing the timeout"] }
        ],
        project: {
          title: "Reconcile two conflicting reports",
          brief: "Take two reports that disagree. Document each definition, isolate the drivers of the gap with evidence, and publish one reconciled definition with an owner."
        }
      },
      {
        id: "requirements-ba",
        name: "Requirements Elicitation & Documentation",
        lens: "Interviews, user stories, traceability, sign-off",
        summary: "Requirements fail in the gap between what a stakeholder said and what they meant. This track covers elicitation technique, writing stories that survive handoff, and traceability.",
        lessons: [
          {
            title: "Elicitation is not order-taking",
            body: "Stakeholders describe solutions, because solutions are concrete and needs are hard to articulate. 'I need a dropdown on the approvals screen' is an answer to a question they already asked themselves and did not share.\n\nThe technique is to walk backward: what would the dropdown let you do, what happens today without it, how often, and what goes wrong. Often the underlying need is served better by something else entirely, and occasionally it is already possible and the real problem is discoverability.\n\nThe second half of elicitation is finding the people who were not in the room. The person who requests a change is rarely the person who lives with its consequences. Ask who else touches this process, and who handles the exceptions, because exception handlers hold the requirements nobody documents."
          },
          {
            title: "Stories and acceptance criteria",
            body: "The user story format carries the why into the backlog: as a [role], I want [capability], so that [outcome]. The outcome clause is the part that gets dropped and the part that matters, because it is what a developer uses to resolve an ambiguity without you.\n\nAcceptance criteria make it testable. Given/when/then works well: given a purchase order above the approval threshold, when the requester submits it, then it routes to the cost-centre owner and the requester sees the pending approver's name.\n\nThe INVEST checklist is the quality bar: independent, negotiable, valuable, estimable, small, testable. Of these, testable and small do the most work in practice. A story nobody can test is a story nobody can finish, and a story too large to estimate hides the complexity that will blow the sprint."
          },
          {
            title: "Traceability and sign-off",
            body: "Traceability links each requirement to the business objective it serves and to the test that verifies it. Its value shows up under pressure: when the schedule slips and something has to be cut, traceability tells you what business outcome you are cutting rather than which feature.\n\nIt also answers the audit question directly, which matters in regulated environments: show that every control the policy requires has a requirement and a passing test.\n\nSign-off is a different mechanism and often misunderstood. Its purpose is not to trap stakeholders into agreement, it is to force a genuine review before build. A sign-off that happens over email with no walkthrough produces the same rework as no sign-off at all. Walk the scenarios, capture the disagreements, then sign."
          }
        ],
        practice: [
          {
            prompt: "A stakeholder asks for a report with 40 columns. What do you ask?",
            answer: "Ask what decision the report supports and what they would do differently based on it. Then ask which columns they would look at first, and what they currently do to get this information. Most 40-column requests are an attempt to avoid a second round trip because requests are slow, so the real requirement may be self-service filtering rather than every column at once."
          },
          {
            prompt: "Write a story and two acceptance criteria for an expense approval threshold.",
            answer: "As a finance controller, I want expenses above \u00a35,000 to require a second approver, so that large spend has dual oversight before it commits budget. Given an expense of \u00a35,000.01, when the first approver approves, then the request moves to pending-second-approval and the submitter is notified of who holds it. Given an expense of exactly \u00a35,000.00, when the first approver approves, then it is fully approved, confirming the threshold is exclusive."
          }
        ],
        quiz: [
          { q: "The 'so that' clause in a user story exists to:", opts: ["Satisfy the template", "Carry the intent so developers can resolve ambiguity correctly", "Identify the stakeholder", "Estimate effort"], a: 1, why: "No story covers every case; the stated outcome is what lets someone make the unwritten call correctly." },
          { q: "The most commonly missed stakeholder group is:", opts: ["Executives", "The people who handle exceptions in the current process", "The development team", "End customers"], a: 1, why: "Exception handlers hold undocumented requirements that only surface after launch." },
          { q: "Traceability is most valuable when:", opts: ["Writing the first draft", "Scope must be cut and you need to know which business outcome is affected", "Estimating effort", "Onboarding new team members"], a: 1, why: "It converts a feature cut into a visible business-outcome decision." }
        ],
        assessment: [
          { lvl: 1, q: "Which is a functional requirement?", opts: ["The system shall respond within 2 seconds", "The system shall route approvals above threshold to a second approver", "The system shall be available 99.9% of the time", "The system shall support 10,000 concurrent users"] },
          { lvl: 1, q: "INVEST's 'T' stands for:", opts: ["Traceable", "Testable", "Timeboxed", "Technical"] },
          { lvl: 2, q: "A stakeholder requests a specific UI control. The best first response is:", opts: ["Document it as specified", "Ask what it would let them accomplish and what happens today without it", "Propose an alternative design", "Estimate it"] },
          { lvl: 2, q: "Two stakeholders give contradictory requirements. The correct action is:", opts: ["Implement both", "Document the conflict explicitly and bring them together to decide, with the tradeoff stated", "Pick the more senior one", "Defer the requirement"] },
          { lvl: 3, q: "Which acceptance criterion is weakest?", opts: ["Given an over-threshold expense, when submitted, then a second approver is required", "The approval flow should work correctly", "Given an expense at exactly the threshold, when submitted, then only one approver is required", "Given no available second approver, when submitted, then the request queues and notifies finance"] },
          { lvl: 3, q: "Scope creep is best controlled by:", opts: ["Refusing all changes", "A documented change process that shows cost and schedule impact for each request", "Longer requirements phases", "More detailed specs"] },
          { lvl: 4, q: "After launch, users bypass the new process with a spreadsheet. The most probable requirements failure is:", opts: ["Insufficient training", "The real workflow, including its exceptions, was never elicited from the people doing it", "Poor UI design", "Inadequate testing"] },
          { lvl: 4, q: "A regulated project needs to prove every policy control is implemented. The mechanism is:", opts: ["A detailed PRD", "A traceability matrix linking controls to requirements to test cases", "Stakeholder sign-off", "Code review records"] },
          { lvl: 5, q: "Requirements are signed off, but rework is still heavy. The most likely cause is:", opts: ["Developers ignore requirements", "Sign-off happened without a scenario walkthrough, so stakeholders approved documents they had not really evaluated", "Too few requirements", "The template is wrong"] },
          { lvl: 5, q: "A long project's requirements are now partly obsolete mid-build. The most effective structural response is:", opts: ["Freeze requirements", "Shorten the cycle between elicitation and delivery so requirements are validated while still current", "Add more detail upfront", "Extend the timeline"] }
        ],
        project: {
          title: "Elicit and document a real process",
          brief: "Pick a process you can observe. Interview two people who run it and one who handles its exceptions, then deliver stories with acceptance criteria and a traceability matrix to business objectives."
        }
      },
      {
        id: "process-ba",
        name: "Process Mapping & BPMN",
        lens: "As-is/to-be, swimlanes, handoffs, bottlenecks",
        summary: "A process map is an analytical instrument, not documentation. This track covers swimlane mapping, finding the handoffs where work dies, and designing a to-be state that someone will actually adopt.",
        lessons: [
          {
            title: "As-is before to-be, always",
            body: "Teams that skip the as-is map design an improved version of a process that does not exist. The documented process and the real one diverge within months of any process going live, because people build workarounds for the parts that do not work.\n\nMap the as-is by walking it with the people who do it, not from the procedure document. Ask where things get stuck, what they do when the system says no, and what they keep in a personal spreadsheet. Those three questions find the real process.\n\nThe as-is map also creates the baseline for measuring improvement. Without it, the to-be design has no evidence behind it and no way to show it worked."
          },
          {
            title: "Swimlanes expose handoffs",
            body: "The reason to use swimlanes rather than a flat flowchart is that most process failure lives at handoffs between roles, and swimlanes make every handoff a visible line crossing a boundary.\n\nWhat to look for: a step that crosses lanes and comes back, which indicates a clarification loop. A lane that appears once for an approval, which is often a rubber stamp adding days for no decision. And any handoff with no defined trigger, where work waits because nobody knows it arrived.\n\nAnnotate each step with elapsed time and touch time. The ratio is usually shocking: a process with four hours of actual work taking eleven days. That gap is queueing at handoffs, and it is where the improvement is, not in making the four hours faster."
          },
          {
            title: "Designing a to-be people adopt",
            body: "A to-be process that is theoretically optimal and practically unadoptable is worth nothing. Three design constraints keep it real.\n\nRemove steps before automating them. Automating a rubber-stamp approval preserves a step that should not exist. Design the exception path explicitly, because the exception is where people abandon the process, and a to-be map that only covers the happy path guarantees workarounds. And check whether each role has the authority and information the new process assumes, since the most common adoption failure is a decision pushed to someone who lacks the information to make it.\n\nThen measure adoption directly rather than assuming it. If the old path still exists, some portion of volume will keep flowing through it, and that portion tells you what your design missed."
          }
        ],
        practice: [
          {
            prompt: "A purchase requisition process has 4 hours touch time and 11 days elapsed. Where is the improvement?",
            answer: "In the queues at handoffs, not in the work itself. Even eliminating half the touch time saves two hours out of eleven days. Look at what each item waits for between steps: batched approvals processed weekly, requests sitting in an inbox with no arrival trigger, and clarification loops where an incomplete form bounces back. Fixing triggers and completeness at submission usually collapses most of the elapsed time."
          },
          {
            prompt: "Every approval in your as-is map has been approved 100% of the time for two years. What do you recommend?",
            answer: "Recommend removing the step, not automating it. An approval that never rejects is not a control, it is a delay with a signature. Before removing it, confirm what risk it was meant to catch and whether another control covers that risk, then propose replacing it with a threshold-based or sampled review so genuine exceptions still get seen."
          }
        ],
        quiz: [
          { q: "Swimlanes primarily make visible:", opts: ["Process duration", "Handoffs between roles, where most failures occur", "System boundaries", "Decision logic"], a: 1, why: "Every lane crossing is a handoff, and handoffs are where work queues and gets lost." },
          { q: "A large gap between elapsed time and touch time indicates:", opts: ["Inefficient workers", "Queueing and waiting at handoffs", "Too many systems", "Poor documentation"], a: 1, why: "The gap is waiting, not working, so speeding up the work barely moves the total." },
          { q: "Mapping as-is from the procedure document rather than by observation risks:", opts: ["Taking longer", "Mapping a process that no longer resembles what people actually do", "Missing system integrations", "Over-detailing"], a: 1, why: "Documented and actual processes diverge quickly as people build workarounds." }
        ],
        assessment: [
          { lvl: 1, q: "In BPMN, a diamond represents:", opts: ["A task", "A gateway, where the path splits or merges", "An event", "A data object"] },
          { lvl: 1, q: "The purpose of an as-is map is to:", opts: ["Document the ideal process", "Establish what actually happens today as a baseline", "Train new staff", "Satisfy auditors"] },
          { lvl: 2, q: "A step that crosses into another lane and returns usually indicates:", opts: ["Good collaboration", "A clarification or rework loop worth investigating", "A required approval", "A system boundary"] },
          { lvl: 2, q: "Touch time measures:", opts: ["Total time from request to completion", "Actual hands-on work time", "Time spent in approvals", "System processing time"] },
          { lvl: 3, q: "An approval with a 100% approval rate over two years should first be:", opts: ["Automated", "Questioned as a candidate for removal, with its intended control re-examined", "Moved earlier", "Assigned to a more senior approver"] },
          { lvl: 3, q: "Your to-be design assumes a coordinator decides priority. Adoption fails. The most likely cause is:", opts: ["Insufficient training", "The coordinator lacks the information or authority the design assumes", "Resistance to change", "Poor tooling"] },
          { lvl: 4, q: "After rollout, 30% of volume still flows through the old path. The most useful interpretation is:", opts: ["Users are resistant", "That 30% represents cases the new design does not handle, and it identifies the gap", "Training was inadequate", "The old path should be disabled immediately"] },
          { lvl: 4, q: "Which improvement most reduces an 11-day elapsed time with 4 hours of touch time?", opts: ["Faster software for each task", "Eliminating a batched weekly approval cycle and adding arrival triggers at handoffs", "Adding staff to each step", "More detailed work instructions"] },
          { lvl: 5, q: "Two departments each optimized their own segment and total cycle time got worse. The likely cause is:", opts: ["Poor execution", "Local optimization shifted work or batching in a way that increased queueing at the shared handoff", "Insufficient automation", "Measurement error"] },
          { lvl: 5, q: "The most reliable evidence that a to-be process succeeded is:", opts: ["Stakeholder satisfaction survey", "Measured elapsed time, rework rate, and the share of volume using the new path, against the as-is baseline", "Completed training records", "The process map being approved"] }
        ],
        project: {
          title: "Map and redesign a real process",
          brief: "Map an as-is process in swimlanes with elapsed and touch time per step. Identify the three largest queueing points, then design a to-be with an explicit exception path and an adoption measure."
        }
      },
      {
        id: "excel-ba",
        name: "Excel & Business Modeling",
        lens: "Lookups, pivots, model structure, auditability",
        summary: "Business analysts live in spreadsheets that other people have to trust. This track covers lookup functions, pivot analysis, and structuring a model so an auditor can follow it.",
        lessons: [
          {
            title: "Lookups without the landmines",
            body: "VLOOKUP's default behavior is the most common source of wrong numbers in business spreadsheets. Omitting the fourth argument gives you approximate match, which returns the closest lower value rather than an error when nothing matches. On unsorted data, that produces a plausible wrong answer silently.\n\nAlways pass FALSE, or better, use XLOOKUP, which defaults to exact match and lets you specify what happens when nothing is found. INDEX/MATCH remains useful for lookups to the left of the key and for two-dimensional lookups.\n\nThe second landmine is column insertion. VLOOKUP's column index is positional, so inserting a column in the source range silently shifts what the formula returns. XLOOKUP and INDEX/MATCH reference columns directly and survive the edit."
          },
          {
            title: "Pivot tables as analysis, not formatting",
            body: "A pivot table answers questions about grain: what is the total by this dimension, and how does it break down by that one. Used well it replaces dozens of formulas and is far easier to audit.\n\nTwo habits matter. Build pivots over a proper table object rather than a fixed range, so new rows are included automatically instead of silently omitted. And check the grain of your source: a pivot over a joined dataset that has fan-out will happily sum inflated values.\n\nCalculated fields inside a pivot are a common trap. A calculated field that computes a ratio applies the formula to the aggregated totals, which is usually what you want, while a ratio column computed row by row in the source and then averaged is not. Knowing which one your number is matters more than the formula itself."
          },
          {
            title: "Structure a model people can audit",
            body: "The convention that makes a model trustworthy: separate inputs, calculations, and outputs, and never mix them in a cell. A hardcoded number inside a formula is invisible to a reviewer and is where errors hide.\n\nColour-code inputs distinctly, keep one input in one place and reference it everywhere else, and never repeat a constant. When a growth rate lives in four formulas, three will eventually be updated and one will not.\n\nAdd check rows: a balance check, a total-of-parts against the independently calculated total, and a flag that turns visible when a check fails. Every serious financial model carries these, and they are what let someone else trust your output without re-deriving it. Version the file with a change log if it is going to circulate."
          }
        ],
        practice: [
          {
            prompt: "A VLOOKUP returns values for every row, but you know 12 keys are missing from the source. What happened?",
            answer: "The fourth argument was omitted or set to TRUE, so it performed an approximate match and returned the nearest lower value instead of #N/A. On unsorted data this returns essentially arbitrary matches. Fix it with FALSE as the fourth argument, or switch to XLOOKUP, and wrap it in IFNA so missing keys are visibly flagged rather than silently filled."
          },
          {
            prompt: "Your model's total does not match the sum of its segments. What checks do you add?",
            answer: "Add an explicit check row: sum of segments minus the total, formatted to show a visible flag when the difference exceeds a rounding tolerance. Then find the cause, which is usually a segment excluded from the total's range, a hardcoded override inside one formula, or double counting where an item belongs to two segments. Keep the check row permanently, not just while debugging."
          }
        ],
        quiz: [
          { q: "VLOOKUP's fourth argument, when omitted, causes:", opts: ["An error", "Approximate match, returning plausible wrong values on unsorted data", "Exact match", "Case-sensitive matching"], a: 1, why: "Approximate match is the default and it fails silently, which is what makes it dangerous." },
          { q: "Inserting a column in a VLOOKUP's source range:", opts: ["Updates the formula automatically", "Silently shifts which column the positional index returns", "Causes #REF!", "Has no effect"], a: 1, why: "The column index is positional, so the formula keeps working while returning the wrong field." },
          { q: "Hardcoding a constant inside a formula is a problem because:", opts: ["It is slower", "It is invisible to a reviewer and will not update when the assumption changes", "Excel cannot audit it", "It breaks pivot tables"], a: 1, why: "Buried constants are the classic hiding place for model errors." }
        ],
        assessment: [
          { lvl: 1, q: "Which function defaults to exact match?", opts: ["VLOOKUP", "XLOOKUP", "HLOOKUP", "LOOKUP"] },
          { lvl: 1, q: "$A$1 in a formula is:", opts: ["A relative reference", "An absolute reference that does not shift when copied", "A named range", "An external link"] },
          { lvl: 2, q: "A pivot built over a fixed range misses new rows added to the source. The fix is:", opts: ["Refresh more often", "Build the pivot over a table object or dynamic range", "Sort the source", "Use GETPIVOTDATA"] },
          { lvl: 2, q: "IFERROR wrapped around an entire calculation is risky because:", opts: ["It slows the workbook", "It hides genuine errors along with expected ones", "It only catches #N/A", "It breaks references"] },
          { lvl: 3, q: "Average of a ratio column differs from the ratio of the totals. This is because:", opts: ["A calculation error", "Averaging ratios weights every row equally, while the ratio of totals weights by size", "Rounding", "Pivot cache staleness"] },
          { lvl: 3, q: "The most effective structural convention for an auditable model is:", opts: ["Consistent fonts", "Separating inputs, calculations, and outputs, with each input defined once", "Extensive cell comments", "Protecting all sheets"] },
          { lvl: 4, q: "A shared model produces different results on two machines. The most likely cause is:", opts: ["Excel version differences alone", "A volatile or locale-dependent element such as TODAY(), regional separators, or manual calculation mode", "File corruption", "Add-in conflicts"] },
          { lvl: 4, q: "Which check row adds the most value to a segment-level revenue model?", opts: ["Row count", "Sum of segments minus independently calculated total, flagged when it exceeds tolerance", "Maximum value", "Date of last edit"] },
          { lvl: 5, q: "A model you inherit has correct outputs but is impossible to audit. The right first action is:", opts: ["Rebuild it entirely", "Map the input-calculation-output structure and extract buried constants into a documented input block, verifying outputs are unchanged at each step", "Add documentation", "Keep using it as-is"] },
          { lvl: 5, q: "When a spreadsheet model becomes the system of record for a recurring business process, the main risk is:", opts: ["File size", "No version control, no access control, and no test coverage, so errors propagate silently and untraceably", "Formula complexity", "Slow recalculation"] }
        ],
        project: {
          title: "Build an auditable model",
          brief: "Build a segment-level revenue model with a separated input block, at least two check rows, and no hardcoded constants in formulas. Hand it to someone else and have them find every assumption without asking you."
        }
      },
      {
        id: "stakeholder-ba",
        name: "Stakeholder Management",
        lens: "Mapping influence, managing conflict, communicating upward",
        summary: "Analysis that nobody acts on is wasted. This track covers stakeholder mapping, handling conflicting interests, and communicating findings to people who will not read the appendix.",
        lessons: [
          {
            title: "Map influence, not just interest",
            body: "The standard grid plots interest against influence, and its value is that it tells you how to spend attention. High influence, high interest: manage closely with regular direct contact. High influence, low interest: keep satisfied, because they surface late and can stop everything. High interest, low influence: keep informed, and they are often your best source of ground truth. Low both: monitor.\n\nThe common mistake is mapping the org chart instead of the actual influence. The person whose objection reliably stops projects may be three levels down, and the executive sponsor may be entirely disengaged.\n\nRe-map at each phase. Influence shifts as a project moves from design to build to rollout, and the operations lead who was peripheral in design becomes decisive at go-live."
          },
          {
            title: "Conflict is usually structural",
            body: "When two stakeholders want incompatible things, it is rarely personal. It is usually that they are measured on different outcomes. Sales is measured on closed deals, support on ticket volume, finance on margin, and a feature that helps one hurts another's number.\n\nTreating it as a personality problem fails. Naming the structural tension works better: 'this reduces support load and adds a step to the sales demo, so we are trading one against the other, and I need a decision on which matters more this quarter.'\n\nThat reframe moves the decision to whoever owns both outcomes, which is where it belongs. The BA's job is not to resolve the conflict but to state it clearly enough that it can be resolved by someone with the authority to trade one metric against another."
          },
          {
            title: "Communicating upward",
            body: "Executives read the first paragraph. Write the conclusion first, then the evidence, then the detail, which is the inverse of how the analysis was done and the inverse of how most analysts write.\n\nThe structure that works: here is the recommendation, here is what it costs and what it gets you, here are the two risks, here is what I need from you. Everything else goes in an appendix that exists to be referenced, not read.\n\nQuantify in the unit the audience owns. A support lead thinks in tickets and headcount, a CFO in margin and cash, a sales leader in pipeline and cycle time. The same finding translated into the right unit gets a decision, and translated into the wrong one gets a follow-up meeting."
          }
        ],
        practice: [
          {
            prompt: "Your executive sponsor has not attended a meeting in six weeks. What do you do?",
            answer: "Treat them as high-influence, low-interest: they will re-engage at a decision point or a problem, and by then their objections are expensive. Shift to a short written update on a fixed cadence, no more than a few lines, covering status, decisions needed, and risks. Ask explicitly for the decisions you need and give a date. Do not rely on meeting attendance as the engagement channel, because that is already not working."
          },
          {
            prompt: "Summarize a finding for a CFO: the new process cuts 3 days off a 5-day cycle but needs one additional headcount.",
            answer: "Lead with the trade in their unit: one FTE of ongoing cost buys a 60% reduction in cycle time, which releases working capital tied up in the current 5-day float and reduces the late-payment penalties we incurred last quarter. Then state the annualized cost of the headcount, the quantified benefit, and the payback period. Risks and the process detail go below, and the recommendation with a decision date goes in the first paragraph."
          }
        ],
        quiz: [
          { q: "A stakeholder with high influence and low interest should be:", opts: ["Monitored minimally", "Kept satisfied with proactive brief updates, since they engage late and decisively", "Managed closely in every meeting", "Informed only at launch"], a: 1, why: "Late engagement from a high-influence stakeholder is the classic source of expensive reversals." },
          { q: "Two stakeholders with incompatible requirements most often reflects:", opts: ["A personality conflict", "Different metrics and incentives, which is a structural tension", "Poor requirements gathering", "Unclear project scope"], a: 1, why: "Naming the incentive conflict lets the person who owns both outcomes decide." },
          { q: "Writing for executives means:", opts: ["Shortening every section proportionally", "Leading with the recommendation and what it costs, with detail in an appendix", "Removing the data", "Using more visuals"], a: 1, why: "Conclusion-first structure matches how the decision actually gets made." }
        ],
        assessment: [
          { lvl: 1, q: "A stakeholder map plots interest against:", opts: ["Seniority", "Influence", "Availability", "Technical knowledge"] },
          { lvl: 1, q: "RACI's 'A' designates:", opts: ["Assisting", "Accountable, the single person answerable for the outcome", "Approving", "Advising"] },
          { lvl: 2, q: "Mapping stakeholders from the org chart risks:", opts: ["Taking too long", "Missing the people whose informal influence actually stops or accelerates work", "Offending senior staff", "Overcomplicating the map"] },
          { lvl: 2, q: "A stakeholder repeatedly reopens a settled decision. The most effective response is:", opts: ["Refuse to discuss it", "Surface the documented decision with its rationale and ask what new information has changed", "Escalate immediately", "Re-run the analysis"] },
          { lvl: 3, q: "Sales wants a feature that raises support load. The most useful framing for leadership is:", opts: ["Sales is being unreasonable", "This trades support cost against deal velocity; here is the magnitude of each, and I need a decision on which we prioritize this quarter", "We should do neither", "Support should absorb it"] },
          { lvl: 3, q: "Your analysis contradicts what the sponsor publicly committed to. The best approach is:", opts: ["Soften the findings", "Present privately first, framed around the risk to their committed outcome, with options", "Present it in the full steering committee", "Withhold it"] },
          { lvl: 4, q: "A project is technically successful but adoption is low, and stakeholders say they were not consulted. The likely root cause is:", opts: ["Poor training", "Stakeholders affected by the change were identified late or not at all, so their requirements never entered the design", "Insufficient communication", "Technical complexity"] },
          { lvl: 4, q: "A weekly status report goes unread by all recipients. The most effective change is:", opts: ["Send it more often", "Cut it to decisions needed, risks, and changes since last week, and address requests to named people", "Add more detail", "Move to a meeting"] },
          { lvl: 5, q: "A steering committee consistently defers decisions. The most probable structural cause is:", opts: ["Poor facilitation", "The people in the room lack authority over the tradeoff, or the options are not presented with quantified consequences", "Meetings are too short", "Too many attendees"] },
          { lvl: 5, q: "The most reliable sign that stakeholder management is working is:", opts: ["Meeting attendance", "Decisions get made on schedule and stay made", "Positive feedback", "Report readership"] }
        ],
        project: {
          title: "Map and move a real decision",
          brief: "Take a stalled decision. Map the stakeholders by actual influence, identify the structural tension blocking it, and write the one-page conclusion-first memo that would unblock it."
        }
      }
    ]
  }
);
