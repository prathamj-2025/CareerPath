/* Business Analyst and Data Analyst tracks.
   Note how SQL appears again with an entirely different lens and question bank. */

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
          { lvl: 1, q: "Which comparison correctly finds rows with a missing value?", opts: ["WHERE col = NULL", "WHERE col IS NULL", "WHERE col = ''", "WHERE col != col"], a: 1, why: "Null is not comparable with =. IS NULL is the only correct test." },
          { lvl: 1, q: "You need totals per region. The correct clause is:", opts: ["ORDER BY region", "GROUP BY region", "PARTITION BY region", "DISTINCT region"], a: 1, why: "GROUP BY sets the aggregation grain." },
          { lvl: 2, q: "A LEFT JOIN from customers to orders, filtered with WHERE orders.status = 'complete', behaves like:", opts: ["A LEFT JOIN", "An INNER JOIN, because the WHERE clause removes the null-extended rows", "A CROSS JOIN", "A FULL OUTER JOIN"], a: 1, why: "Filtering the right table in WHERE discards the unmatched rows the LEFT JOIN preserved. The condition belongs in the ON clause instead." },
          { lvl: 2, q: "Your report must exclude test accounts. The most maintainable approach is:", opts: ["Hardcode the account IDs in every query", "Maintain an exclusion flag or reference table applied consistently", "Filter manually in Excel afterward", "Sort them to the bottom"], a: 1, why: "A single maintained definition keeps every report consistent as the exclusion list changes." },
          { lvl: 3, q: "Order revenue triples after joining order_items. The correct fix when you want revenue per order is:", opts: ["Use SELECT DISTINCT", "Aggregate order_items to one row per order before joining", "Divide the total by three", "Switch to a LEFT JOIN"], a: 1, why: "DISTINCT removes duplicate rows but not the inflated aggregate. Pre-aggregating restores the intended grain." },
          { lvl: 3, q: "Two reports disagree on active users by 6%. The most efficient first step is:", opts: ["Rebuild both queries", "Compare the two definitions and their filters line by line", "Ask the data team", "Take the average"], a: 1, why: "Definitional differences explain the large majority of reconciliation gaps and cost minutes to check." },
          { lvl: 4, q: "You need the most recent status per account from a status history table. The cleanest approach is:", opts: ["MAX(status)", "ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY changed_at DESC) and filter to 1", "SELECT DISTINCT ON status", "GROUP BY account_id, status"], a: 1, why: "MAX on the status column returns the alphabetically largest value, not the latest. Ranking by time is the correct pattern." },
          { lvl: 4, q: "A monthly report is correct in aggregate but wrong for the final two days each month. The most likely cause is:", opts: ["Source data lag", "A timezone or inclusive-endpoint boundary error in the date filter", "Join fan-out", "Null handling"], a: 1, why: "Errors concentrated at period boundaries point squarely at the date predicate, usually timezone or an exclusive endpoint." },
          { lvl: 5, q: "Stakeholders keep re-deriving your numbers and getting different answers. The durable fix is:", opts: ["Send the raw data", "Publish the metric definition, the query, and the exclusions alongside the number, with one owner", "Lock the report", "Add more charts"], a: 1, why: "Reproducibility, not presentation, is what ends recurring disputes over the same metric." },
          { lvl: 5, q: "A query that takes 40 minutes must run daily. Before asking for more hardware, the highest-value check is:", opts: ["Adding DISTINCT", "Whether filters are applied before joins and whether the query scans partitions it does not need", "Rewriting in Python", "Increasing the timeout"], a: 1, why: "Reducing the scanned volume early is almost always the largest available win, and it costs nothing." }
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
          { lvl: 1, q: "Which is a functional requirement?", opts: ["The system shall respond within 2 seconds", "The system shall route approvals above threshold to a second approver", "The system shall be available 99.9% of the time", "The system shall support 10,000 concurrent users"], a: 1, why: "Functional requirements describe behavior; the others are non-functional quality attributes." },
          { lvl: 1, q: "INVEST's 'T' stands for:", opts: ["Traceable", "Testable", "Timeboxed", "Technical"], a: 1, why: "A story without a test has no definition of done." },
          { lvl: 2, q: "A stakeholder requests a specific UI control. The best first response is:", opts: ["Document it as specified", "Ask what it would let them accomplish and what happens today without it", "Propose an alternative design", "Estimate it"], a: 1, why: "Walking back to the need often reveals a better or cheaper solution, and sometimes an existing one." },
          { lvl: 2, q: "Two stakeholders give contradictory requirements. The correct action is:", opts: ["Implement both", "Document the conflict explicitly and bring them together to decide, with the tradeoff stated", "Pick the more senior one", "Defer the requirement"], a: 1, why: "Silent resolution by the BA hides a business decision that the business owns." },
          { lvl: 3, q: "Which acceptance criterion is weakest?", opts: ["Given an over-threshold expense, when submitted, then a second approver is required", "The approval flow should work correctly", "Given an expense at exactly the threshold, when submitted, then only one approver is required", "Given no available second approver, when submitted, then the request queues and notifies finance"], a: 1, why: "It is unobservable and untestable, so it passes trivially and catches nothing." },
          { lvl: 3, q: "Scope creep is best controlled by:", opts: ["Refusing all changes", "A documented change process that shows cost and schedule impact for each request", "Longer requirements phases", "More detailed specs"], a: 1, why: "Making the cost visible lets the business choose. Blanket refusal just pushes changes underground." },
          { lvl: 4, q: "After launch, users bypass the new process with a spreadsheet. The most probable requirements failure is:", opts: ["Insufficient training", "The real workflow, including its exceptions, was never elicited from the people doing it", "Poor UI design", "Inadequate testing"], a: 1, why: "Workarounds indicate the designed process does not fit actual work, which is an elicitation gap." },
          { lvl: 4, q: "A regulated project needs to prove every policy control is implemented. The mechanism is:", opts: ["A detailed PRD", "A traceability matrix linking controls to requirements to test cases", "Stakeholder sign-off", "Code review records"], a: 1, why: "Traceability is the only artifact that demonstrates complete coverage end to end." },
          { lvl: 5, q: "Requirements are signed off, but rework is still heavy. The most likely cause is:", opts: ["Developers ignore requirements", "Sign-off happened without a scenario walkthrough, so stakeholders approved documents they had not really evaluated", "Too few requirements", "The template is wrong"], a: 1, why: "Sign-off without genuine review is a formality. Walking concrete scenarios is what surfaces disagreement before build." },
          { lvl: 5, q: "A long project's requirements are now partly obsolete mid-build. The most effective structural response is:", opts: ["Freeze requirements", "Shorten the cycle between elicitation and delivery so requirements are validated while still current", "Add more detail upfront", "Extend the timeline"], a: 1, why: "Obsolescence is a function of elapsed time between specification and delivery; more upfront detail makes it worse, not better." }
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
          { lvl: 1, q: "In BPMN, a diamond represents:", opts: ["A task", "A gateway, where the path splits or merges", "An event", "A data object"], a: 1, why: "Gateways control branching and merging of the flow." },
          { lvl: 1, q: "The purpose of an as-is map is to:", opts: ["Document the ideal process", "Establish what actually happens today as a baseline", "Train new staff", "Satisfy auditors"], a: 1, why: "It is the evidence base and the measurement baseline for any improvement." },
          { lvl: 2, q: "A step that crosses into another lane and returns usually indicates:", opts: ["Good collaboration", "A clarification or rework loop worth investigating", "A required approval", "A system boundary"], a: 1, why: "Round trips are almost always rework caused by incomplete information at the handoff." },
          { lvl: 2, q: "Touch time measures:", opts: ["Total time from request to completion", "Actual hands-on work time", "Time spent in approvals", "System processing time"], a: 1, why: "Touch time is work; elapsed time includes all waiting." },
          { lvl: 3, q: "An approval with a 100% approval rate over two years should first be:", opts: ["Automated", "Questioned as a candidate for removal, with its intended control re-examined", "Moved earlier", "Assigned to a more senior approver"], a: 1, why: "Automating preserves a step that adds delay without catching anything. Removing requires confirming what risk it covered." },
          { lvl: 3, q: "Your to-be design assumes a coordinator decides priority. Adoption fails. The most likely cause is:", opts: ["Insufficient training", "The coordinator lacks the information or authority the design assumes", "Resistance to change", "Poor tooling"], a: 1, why: "Decisions pushed to roles without the necessary information or authority stall, and people route around them." },
          { lvl: 4, q: "After rollout, 30% of volume still flows through the old path. The most useful interpretation is:", opts: ["Users are resistant", "That 30% represents cases the new design does not handle, and it identifies the gap", "Training was inadequate", "The old path should be disabled immediately"], a: 1, why: "Residual volume is diagnostic. Disabling the path before understanding it just pushes the cases into email." },
          { lvl: 4, q: "Which improvement most reduces an 11-day elapsed time with 4 hours of touch time?", opts: ["Faster software for each task", "Eliminating a batched weekly approval cycle and adding arrival triggers at handoffs", "Adding staff to each step", "More detailed work instructions"], a: 1, why: "The time is in queues. Batch cycles and untriggered waits are the dominant contributors." },
          { lvl: 5, q: "Two departments each optimized their own segment and total cycle time got worse. The likely cause is:", opts: ["Poor execution", "Local optimization shifted work or batching in a way that increased queueing at the shared handoff", "Insufficient automation", "Measurement error"], a: 1, why: "Optimizing segments independently commonly increases variability and batch size at the boundary between them." },
          { lvl: 5, q: "The most reliable evidence that a to-be process succeeded is:", opts: ["Stakeholder satisfaction survey", "Measured elapsed time, rework rate, and the share of volume using the new path, against the as-is baseline", "Completed training records", "The process map being approved"], a: 1, why: "Adoption share plus baseline-relative outcome metrics is the only combination that distinguishes real change from a documented one." }
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
          { lvl: 1, q: "Which function defaults to exact match?", opts: ["VLOOKUP", "XLOOKUP", "HLOOKUP", "LOOKUP"], a: 1, why: "XLOOKUP was designed with exact match as the default, removing the most common lookup error." },
          { lvl: 1, q: "$A$1 in a formula is:", opts: ["A relative reference", "An absolute reference that does not shift when copied", "A named range", "An external link"], a: 1, why: "Both row and column are locked by the dollar signs." },
          { lvl: 2, q: "A pivot built over a fixed range misses new rows added to the source. The fix is:", opts: ["Refresh more often", "Build the pivot over a table object or dynamic range", "Sort the source", "Use GETPIVOTDATA"], a: 1, why: "Table objects expand automatically, so the pivot source always covers all rows." },
          { lvl: 2, q: "IFERROR wrapped around an entire calculation is risky because:", opts: ["It slows the workbook", "It hides genuine errors along with expected ones", "It only catches #N/A", "It breaks references"], a: 1, why: "Blanket error suppression converts real bugs into clean-looking zeros." },
          { lvl: 3, q: "Average of a ratio column differs from the ratio of the totals. This is because:", opts: ["A calculation error", "Averaging ratios weights every row equally, while the ratio of totals weights by size", "Rounding", "Pivot cache staleness"], a: 1, why: "These are different statistics; picking the wrong one is a common and consequential reporting mistake." },
          { lvl: 3, q: "The most effective structural convention for an auditable model is:", opts: ["Consistent fonts", "Separating inputs, calculations, and outputs, with each input defined once", "Extensive cell comments", "Protecting all sheets"], a: 1, why: "Separation plus single-definition inputs is what lets a reviewer trace any number to its source." },
          { lvl: 4, q: "A shared model produces different results on two machines. The most likely cause is:", opts: ["Excel version differences alone", "A volatile or locale-dependent element such as TODAY(), regional separators, or manual calculation mode", "File corruption", "Add-in conflicts"], a: 1, why: "Volatile functions and locale settings are the usual culprits behind machine-dependent results." },
          { lvl: 4, q: "Which check row adds the most value to a segment-level revenue model?", opts: ["Row count", "Sum of segments minus independently calculated total, flagged when it exceeds tolerance", "Maximum value", "Date of last edit"], a: 1, why: "A reconciliation check catches the most common and most damaging class of model error." },
          { lvl: 5, q: "A model you inherit has correct outputs but is impossible to audit. The right first action is:", opts: ["Rebuild it entirely", "Map the input-calculation-output structure and extract buried constants into a documented input block, verifying outputs are unchanged at each step", "Add documentation", "Keep using it as-is"], a: 1, why: "Incremental restructuring with output verification preserves correctness while making the model reviewable. A full rebuild risks introducing new errors invisibly." },
          { lvl: 5, q: "When a spreadsheet model becomes the system of record for a recurring business process, the main risk is:", opts: ["File size", "No version control, no access control, and no test coverage, so errors propagate silently and untraceably", "Formula complexity", "Slow recalculation"], a: 1, why: "Spreadsheets lack the controls a production system has, which is why this transition is a recognized operational risk." }
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
          { lvl: 1, q: "A stakeholder map plots interest against:", opts: ["Seniority", "Influence", "Availability", "Technical knowledge"], a: 1, why: "Influence, not title, determines how much attention a stakeholder needs." },
          { lvl: 1, q: "RACI's 'A' designates:", opts: ["Assisting", "Accountable, the single person answerable for the outcome", "Approving", "Advising"], a: 1, why: "Accountability is singular by design; splitting it is the most common RACI failure." },
          { lvl: 2, q: "Mapping stakeholders from the org chart risks:", opts: ["Taking too long", "Missing the people whose informal influence actually stops or accelerates work", "Offending senior staff", "Overcomplicating the map"], a: 1, why: "Formal authority and real influence frequently diverge, especially below the executive layer." },
          { lvl: 2, q: "A stakeholder repeatedly reopens a settled decision. The most effective response is:", opts: ["Refuse to discuss it", "Surface the documented decision with its rationale and ask what new information has changed", "Escalate immediately", "Re-run the analysis"], a: 1, why: "It respects the possibility of genuinely new information while making re-litigation without it visible." },
          { lvl: 3, q: "Sales wants a feature that raises support load. The most useful framing for leadership is:", opts: ["Sales is being unreasonable", "This trades support cost against deal velocity; here is the magnitude of each, and I need a decision on which we prioritize this quarter", "We should do neither", "Support should absorb it"], a: 1, why: "Quantifying the trade moves the decision to whoever owns both metrics instead of the BA arbitrating." },
          { lvl: 3, q: "Your analysis contradicts what the sponsor publicly committed to. The best approach is:", opts: ["Soften the findings", "Present privately first, framed around the risk to their committed outcome, with options", "Present it in the full steering committee", "Withhold it"], a: 1, why: "Private framing around their stated goal preserves the relationship and gives them a path that is not a public reversal." },
          { lvl: 4, q: "A project is technically successful but adoption is low, and stakeholders say they were not consulted. The likely root cause is:", opts: ["Poor training", "Stakeholders affected by the change were identified late or not at all, so their requirements never entered the design", "Insufficient communication", "Technical complexity"], a: 1, why: "Consultation complaints after a technically sound delivery point to a mapping gap, not a messaging gap." },
          { lvl: 4, q: "A weekly status report goes unread by all recipients. The most effective change is:", opts: ["Send it more often", "Cut it to decisions needed, risks, and changes since last week, and address requests to named people", "Add more detail", "Move to a meeting"], a: 1, why: "Reports get read when they demand something specific from a named reader. Comprehensiveness is why they get skipped." },
          { lvl: 5, q: "A steering committee consistently defers decisions. The most probable structural cause is:", opts: ["Poor facilitation", "The people in the room lack authority over the tradeoff, or the options are not presented with quantified consequences", "Meetings are too short", "Too many attendees"], a: 1, why: "Chronic deferral means either the wrong people or insufficient information to choose. Both are fixable structurally." },
          { lvl: 5, q: "The most reliable sign that stakeholder management is working is:", opts: ["Meeting attendance", "Decisions get made on schedule and stay made", "Positive feedback", "Report readership"], a: 1, why: "Decision velocity and durability are the outcome; the other measures are activity." }
        ],
        project: {
          title: "Map and move a real decision",
          brief: "Take a stalled decision. Map the stakeholders by actual influence, identify the structural tension blocking it, and write the one-page conclusion-first memo that would unblock it."
        }
      }
    ]
  },
  {
    id: "da",
    name: "Data Analyst",
    tagline: "Get the number right, then make it mean something.",
    skills: [
      {
        id: "sql-da",
        name: "SQL for Data Analysts",
        lens: "Window functions, CTEs, query performance, complex joins",
        summary: "The analyst lens on SQL goes deeper than reporting: window functions, layered CTEs, and understanding why a query is slow. This is the technical end of the same skill.",
        lessons: [
          {
            title: "Window functions",
            body: "Window functions compute across a set of rows while keeping every row, which is the capability GROUP BY does not have. That single property solves a large class of analytical problems cleanly.\n\nThe three families. Ranking: ROW_NUMBER, RANK, DENSE_RANK, which differ only in how they handle ties. ROW_NUMBER never ties, RANK skips numbers after a tie, DENSE_RANK does not skip. Offset: LAG and LEAD, for comparing a row to its neighbors, which is how you compute period-over-period change without a self-join. Aggregate: SUM, AVG and friends with an OVER clause, for running totals and moving averages.\n\nThe frame clause controls which rows the window covers. ROWS BETWEEN 6 PRECEDING AND CURRENT ROW gives a 7-day moving average. Leaving the frame implicit with an ORDER BY gives RANGE UNBOUNDED PRECEDING, a running total, which surprises people who expected the whole partition."
          },
          {
            title: "CTEs and readable query structure",
            body: "A common table expression names an intermediate result, which turns a nested horror into a sequence of readable steps. WITH daily_orders AS (...), customer_totals AS (...) SELECT ... is a query someone else can review.\n\nThe analytical benefit is testability: each CTE can be selected on its own to check its row count and grain before you trust what sits on top of it. That is the fastest debugging loop available in SQL.\n\nThe caveat is performance and it varies by engine. In some databases a CTE is an optimization fence, materialized once and blocking predicate pushdown; in others it is inlined like a subquery. Postgres changed this behavior in version 12. When a CTE-heavy query is slow, testing the inlined form is a real diagnostic step, not a style preference."
          },
          {
            title: "Why your query is slow",
            body: "Performance work starts with the execution plan, not with guessing. EXPLAIN tells you what the engine will actually do, and the two things worth finding are a sequential scan on a large table where an index should apply, and a row estimate that is wildly off from reality, which means the planner chose a bad join strategy on bad statistics.\n\nThe common wins, in order of frequency. Filter before joining rather than after, so less data flows through the join. Avoid wrapping an indexed column in a function in the WHERE clause, since WHERE DATE(created_at) = '2026-09-01' cannot use an index on created_at while a range condition can. Select only the columns you need, which matters enormously on columnar warehouses. And on partitioned tables, include the partition key in the filter or you will scan everything.\n\nSELECT DISTINCT as a fix for duplicate rows is a smell worth naming: it usually means a join is fanning out, and the DISTINCT is hiding a grain error rather than solving it."
          }
        ],
        practice: [
          {
            prompt: "Write the logic for a 7-day moving average of daily revenue.",
            answer: "Aggregate to one row per day first, then apply an aggregate window with an explicit frame: AVG(daily_revenue) OVER (ORDER BY order_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW). The explicit ROWS frame is essential. Omitting it gives you a running average from the start of the series, and if any dates have no orders, you also need a date spine joined in, or the window will average the last 7 rows present rather than the last 7 calendar days."
          },
          {
            prompt: "A query filters WHERE YEAR(created_at) = 2026 and runs slowly despite an index on created_at. Why?",
            answer: "Wrapping the indexed column in a function makes the index unusable, so the engine scans every row and evaluates the function on each. Rewrite as a range: WHERE created_at >= '2026-01-01' AND created_at < '2027-01-01'. This is sargability, and it is one of the highest-frequency performance bugs in analytical SQL."
          }
        ],
        quiz: [
          { q: "Which ranking function skips numbers after a tie?", opts: ["ROW_NUMBER", "RANK", "DENSE_RANK", "NTILE"], a: 1, why: "RANK leaves gaps after ties; DENSE_RANK does not; ROW_NUMBER never ties." },
          { q: "An aggregate window with ORDER BY but no explicit frame produces:", opts: ["A partition-wide total", "A running total from the partition start to the current row", "An error", "A moving average"], a: 1, why: "The implicit default is RANGE UNBOUNDED PRECEDING, which yields a running total rather than the full partition." },
          { q: "SELECT DISTINCT used to remove duplicate rows after a join usually indicates:", opts: ["Good practice", "A join fan-out hiding a grain error", "Missing indexes", "A need for GROUP BY"], a: 1, why: "It suppresses the symptom while the aggregate above it is already wrong." }
        ],
        assessment: [
          { lvl: 1, q: "Which clause filters rows after aggregation?", opts: ["WHERE", "HAVING", "GROUP BY", "QUALIFY"], a: 1, why: "WHERE filters before grouping; HAVING filters the resulting groups." },
          { lvl: 1, q: "A CTE is introduced with:", opts: ["USING", "WITH", "DECLARE", "TEMP"], a: 1, why: "WITH name AS (...) defines a common table expression." },
          { lvl: 2, q: "To compare each month's revenue to the prior month in the same row, use:", opts: ["A self-join on month - 1", "LAG(revenue) OVER (ORDER BY month)", "GROUP BY month", "A correlated subquery"], a: 1, why: "LAG is the direct, readable, and usually faster way to reach a neighboring row." },
          { lvl: 2, q: "PARTITION BY in a window function:", opts: ["Splits the rows into groups the window is computed within", "Sorts the output", "Filters rows", "Creates physical partitions"], a: 0, why: "It resets the window calculation per group without collapsing rows." },
          { lvl: 3, q: "You need the top 3 products per category by revenue. The cleanest approach is:", opts: ["LIMIT 3 with GROUP BY category", "ROW_NUMBER() OVER (PARTITION BY category ORDER BY revenue DESC), filtered to <= 3", "Three separate queries", "MAX with a subquery"], a: 1, why: "Ranking within a partition is exactly the top-N-per-group pattern; LIMIT applies to the whole result set." },
          { lvl: 3, q: "WHERE DATE(created_at) = '2026-09-01' is slow on an indexed column because:", opts: ["DATE is a slow function", "Wrapping the column in a function makes the index unusable", "The index is fragmented", "Equality on dates is inefficient"], a: 1, why: "Non-sargable predicates force a full scan regardless of the index." },
          { lvl: 4, q: "An EXPLAIN plan shows an estimated 500 rows where 2 million are returned. This indicates:", opts: ["A syntax problem", "Stale or insufficient statistics, likely causing a poor join strategy", "Missing primary key", "Too many joins"], a: 1, why: "Large estimate errors drive the planner to choose nested loops where a hash join was needed." },
          { lvl: 4, q: "To count distinct users per day with a 30-day trailing window efficiently, the main obstacle is:", opts: ["Window functions cannot use COUNT", "COUNT(DISTINCT) is not supported as a window aggregate in most engines, so it needs a different approach", "Frames cannot span 30 days", "It requires a self-join"], a: 1, why: "Distinct counts are not decomposable, which is why rolling unique counts need approximation sketches or a join-based approach." },
          { lvl: 5, q: "A nightly query degraded from 3 to 40 minutes with no code change. The most probable causes to check first are:", opts: ["Syntax deprecation", "Data volume growth crossing a plan threshold, stale statistics, or a partition filter no longer pruning", "Network latency", "Index corruption"], a: 1, why: "Sudden plan flips from volume growth and stale statistics are the standard explanation for step-change regressions." },
          { lvl: 5, q: "Two analysts compute retention differently and both are defensible. The correct organizational response is:", opts: ["Pick the higher number", "Define and publish one canonical metric with its query and exclusions, and treat other variants as named alternatives", "Let each team use its own", "Average them"], a: 1, why: "Canonical definitions with named variants preserve legitimate analytical differences without producing conflicting official numbers." }
        ],
        project: {
          title: "Rolling metrics from raw events",
          brief: "From a raw event table, build a query producing daily active users, 7-day moving average, and week-over-week change using window functions, with an EXPLAIN-backed note on why your version is efficient."
        }
      },
      {
        id: "stats-da",
        name: "Statistics & Inference",
        lens: "Distributions, significance, confidence, common traps",
        summary: "The statistics an analyst actually uses: describing distributions honestly, knowing what a confidence interval says, and recognizing the traps that make plausible analyses wrong.",
        lessons: [
          {
            title: "Describe the distribution, not just the mean",
            body: "Reporting a mean alone on skewed data misleads almost everyone who reads it. Revenue per customer, session duration, and time-to-resolution are all right-skewed: a small number of very large values pull the mean well above where most of the data sits.\n\nFor these, the median describes the typical case and the mean describes the total divided by the count, which is a different and sometimes more relevant thing. Report both when they diverge, and add percentiles: p50, p90, p99 tell a performance story that no average can.\n\nAlways look at the shape before summarizing. A bimodal distribution has a mean sitting in the valley between two groups, describing nobody. That is a signal to segment, because two populations are hiding in one dataset."
          },
          {
            title: "What a confidence interval actually says",
            body: "A 95% confidence interval does not mean there is a 95% probability the true value lies inside this particular interval. The frequentist statement is about the procedure: intervals constructed this way contain the true parameter 95% of the time across repeated sampling.\n\nIn practice what matters is the interpretation discipline. A wide interval means your estimate is imprecise, and reporting the point estimate alone hides that. An interval that includes zero means you cannot rule out no effect. And overlapping intervals between two groups do not automatically mean no significant difference, which is a very common error.\n\nWidth is driven by sample size and variance. If an interval is too wide to support a decision, the answer is more data or less variance, not a different summary statistic."
          },
          {
            title: "The traps that make good analyses wrong",
            body: "Survivorship bias: analyzing only the customers still present tells you about survivors, not about what causes churn. The churned ones hold the information.\n\nSimpson's paradox: a relationship that holds in every subgroup can reverse in the aggregate when group sizes differ. Always check whether a headline relationship survives segmentation.\n\nRegression to the mean: the worst-performing stores this month will improve next month with no intervention at all, purely because extreme values are partly noise. Any analysis that selects an extreme group and then measures change will find an effect that is not there.\n\nMultiple comparisons: testing twenty hypotheses at p < 0.05 produces one false positive on average. Exploratory findings are hypotheses for a new test, not conclusions."
          }
        ],
        practice: [
          {
            prompt: "Mean order value is $180, median is $62. What do you report and what do you check?",
            answer: "Report both and say the distribution is heavily right-skewed. The median describes the typical order; the mean is inflated by a small number of very large orders. Check the top of the distribution: if a handful of bulk or enterprise orders drive the gap, they likely belong in their own segment. Then report per-segment figures, because a single summary statistic across two distinct populations describes neither."
          },
          {
            prompt: "Your team identified the 10 worst-performing regions, ran a support program, and all 10 improved. Did the program work?",
            answer: "The data cannot tell you, because regression to the mean predicts exactly this result with no intervention. Extreme values are partly noise, so the worst performers tend to improve on their own. To make a claim you need a control group of similarly poor performers that did not receive the program, or a pre-registered comparison against the expected regression. Without one, the improvement is not evidence."
          }
        ],
        quiz: [
          { q: "Mean far above median indicates:", opts: ["A data error", "Right skew, usually a long tail of large values", "Left skew", "A normal distribution"], a: 1, why: "Large outliers pull the mean up while the median stays near the bulk of the data." },
          { q: "A 95% confidence interval that includes zero means:", opts: ["The effect is zero", "You cannot rule out no effect at this confidence level", "The sample is too small", "The test failed"], a: 1, why: "It is a statement about what the data can exclude, not proof of absence." },
          { q: "Selecting the worst performers and measuring their later improvement is vulnerable to:", opts: ["Survivorship bias", "Regression to the mean", "Simpson's paradox", "Multiple comparisons"], a: 1, why: "Extreme groups contain noise that does not repeat, producing apparent improvement without any cause." }
        ],
        assessment: [
          { lvl: 1, q: "The median is preferred over the mean when:", opts: ["The sample is large", "The distribution is skewed or has outliers", "Data is categorical", "You need to compute totals"], a: 1, why: "The median resists distortion from extreme values." },
          { lvl: 1, q: "Standard deviation measures:", opts: ["The center of the data", "The typical spread around the mean", "The range", "The sample size"], a: 1, why: "It quantifies dispersion, not location." },
          { lvl: 2, q: "Doubling your sample size narrows a confidence interval by roughly:", opts: ["Half", "A factor of the square root of 2, about 29%", "It does not change", "A quarter"], a: 1, why: "Interval width scales with 1 over the square root of n." },
          { lvl: 2, q: "Correlation of 0.85 between ice cream sales and drownings most likely reflects:", opts: ["Causation", "A confounding variable, temperature", "Sampling error", "Reverse causation"], a: 1, why: "A common cause drives both, which is the textbook confounder." },
          { lvl: 3, q: "Two groups' 95% confidence intervals overlap slightly. You can conclude:", opts: ["There is no significant difference", "Nothing definitive; overlapping intervals do not imply non-significance and a direct test is needed", "The difference is significant", "The samples are too small"], a: 1, why: "Interval overlap is a poor proxy for a significance test of the difference, and this specific error is extremely common." },
          { lvl: 3, q: "You test 20 hypotheses at alpha 0.05 with no real effects. Expected false positives:", opts: ["0", "1", "5", "20"], a: 1, why: "20 \u00d7 0.05 = 1, which is why exploratory findings need confirmation." },
          { lvl: 4, q: "A churn model trained only on currently active customers will:", opts: ["Generalize well", "Suffer survivorship bias, since the churned customers carry the signal", "Overfit", "Be underpowered"], a: 1, why: "Excluding the outcome class you are trying to predict makes the model structurally uninformative." },
          { lvl: 4, q: "A treatment shows a statistically significant 0.1% lift on 5 million users. The right conclusion is:", opts: ["Ship it, it is significant", "The effect is real but likely too small to matter; evaluate practical significance separately", "The test is invalid", "Increase the sample"], a: 1, why: "Very large samples make trivial effects significant. Statistical and practical significance are different questions." },
          { lvl: 5, q: "Conversion improved in every acquisition channel but fell overall. The correct report is:", opts: ["Conversion improved", "Conversion improved within every channel; the aggregate fell because traffic mix shifted toward lower-converting channels", "The data is inconsistent", "Conversion is unchanged"], a: 1, why: "Simpson's paradox. Reporting only the aggregate would invert the actual finding." },
          { lvl: 5, q: "A stakeholder asks you to find 'anything interesting' in a large dataset. The statistically responsible approach is:", opts: ["Test everything and report what is significant", "Explore freely to generate hypotheses, label all findings as exploratory, and confirm the promising ones on held-out data or a new period", "Refuse", "Apply a Bonferroni correction to every test"], a: 1, why: "Open-ended exploration is legitimate for hypothesis generation; the discipline is in labeling and confirming rather than reporting exploratory results as findings." }
        ],
        project: {
          title: "Audit an analysis for traps",
          brief: "Take a published analysis or one from your own work. Identify where survivorship bias, regression to the mean, Simpson's paradox, or multiple comparisons could be affecting the conclusion, and specify the check that would resolve each."
        }
      },
      {
        id: "viz-da",
        name: "Data Visualization & Dashboards",
        lens: "Chart selection, encoding, dashboard structure",
        summary: "A chart is an argument. This track covers choosing the mark that fits the data's shape, honest axes, and dashboards that answer a question rather than displaying everything available.",
        lessons: [
          {
            title: "Match the mark to the shape",
            body: "Chart choice follows from data shape, not from preference. A quantity over time is a line. Comparison across categories is a bar, horizontal when labels are long. Parts of a whole at one point in time is a stacked bar or a single pie with very few slices. A relationship between two continuous variables is a scatter. Distribution is a histogram or box plot.\n\nThe frequent errors are specific. Pie charts with more than five slices, where humans cannot compare angles. Dual axes, which let you manufacture any apparent relationship by choosing scales. And line charts over categorical x-axes, which imply a continuity that does not exist.\n\nFor comparisons that matter, bar length on a common baseline beats every other encoding for accuracy. Color and area are far weaker, which is why heatmaps are for pattern-spotting, not for reading values."
          },
          {
            title: "Honest axes and scales",
            body: "Truncating a bar chart's y-axis exaggerates differences, because bar length is the encoding and cutting the baseline breaks the proportionality the reader assumes. Bars need a zero baseline. Line charts do not carry the same contract, since they encode change rather than magnitude, and a zero baseline can flatten a meaningful movement into a straight line.\n\nLog scales are appropriate for data spanning orders of magnitude or for comparing growth rates, but they must be labeled clearly, because a reader who misses it will misread every distance on the chart.\n\nOne more: start dual-axis charts from a position of suspicion. If two series genuinely need different scales, two aligned charts stacked vertically communicate the same thing without implying a correlation you have manufactured by scale choice."
          },
          {
            title: "Dashboards answer questions",
            body: "The failure mode of dashboards is completeness. A dashboard with 40 tiles is a data dump that forces every viewer to do their own analysis, which means most do none.\n\nStart from the decisions the dashboard supports. Each section should answer a question someone actually asks, in the order they ask it: how are we doing overall, what changed, and where is it coming from. Summary before detail.\n\nEncode state, not just value. A number in a tile makes the reader do the comparison. The same number with a target, a trend direction, and a status colour when it breaches a threshold does the comparison for them, which is the entire point of a dashboard rather than a table. And put an as-of timestamp on it, because a dashboard showing stale data with no indication is worse than no dashboard."
          }
        ],
        practice: [
          {
            prompt: "A stakeholder wants revenue and conversion rate on one chart with dual axes. What do you propose?",
            answer: "Push back and offer two vertically aligned charts sharing the same x-axis. Dual axes let the scale choice create or destroy an apparent relationship, so any correlation the reader sees is an artifact of an arbitrary decision. Aligned charts show the same timing relationship honestly. If they insist on one chart, an alternative is indexing both series to 100 at a base period, which puts them on a genuinely comparable scale."
          },
          {
            prompt: "Your dashboard has 28 tiles and nobody uses it. What do you cut?",
            answer: "Start by asking what decisions it is meant to support, then keep only what informs those. Typically that means one summary row of three to five headline metrics with targets and trend, one section on what changed since last period, and one drill-down for the most common follow-up question. Everything else moves to a linked detail view. A dashboard's value is in what it leaves out."
          }
        ],
        quiz: [
          { q: "Truncating the y-axis is most misleading on:", opts: ["A line chart", "A bar chart, where length is the encoding", "A scatter plot", "A histogram"], a: 1, why: "Bar length encodes magnitude, so cutting the baseline breaks the proportional reading." },
          { q: "Dual-axis charts are risky because:", opts: ["They are hard to render", "Arbitrary scale choices can manufacture an apparent correlation", "They require two datasets", "They cannot be colored"], a: 1, why: "The visual relationship is an artifact of scaling decisions, not of the data." },
          { q: "For accurate comparison of values across categories, the strongest encoding is:", opts: ["Color intensity", "Area", "Length on a common baseline", "Angle"], a: 2, why: "Human perception ranks position and length well above area, angle, and color for judging quantity." }
        ],
        assessment: [
          { lvl: 1, q: "The right chart for a quantity measured monthly over three years is:", opts: ["Pie chart", "Line chart", "Scatter plot", "Stacked bar"], a: 1, why: "Continuous time with one measure is the canonical line chart case." },
          { lvl: 1, q: "Horizontal bars are preferred over vertical when:", opts: ["Values are large", "Category labels are long", "There are few categories", "Data is time-based"], a: 1, why: "Horizontal bars give long labels room without rotating text." },
          { lvl: 2, q: "A pie chart with nine slices fails primarily because:", opts: ["It uses too much color", "Angle comparison is unreliable, especially among similar slices", "It cannot show totals", "It requires sorting"], a: 1, why: "Angle is a weak perceptual channel; a sorted bar chart communicates the same data accurately." },
          { lvl: 2, q: "A log scale is appropriate when:", opts: ["Values are negative", "Data spans several orders of magnitude or you are comparing growth rates", "The audience is technical", "There are many categories"], a: 1, why: "Log scales make multiplicative relationships readable, provided they are clearly labeled." },
          { lvl: 3, q: "A heatmap is best used for:", opts: ["Precise value reading", "Spotting patterns and outliers across a two-dimensional grid", "Comparing two categories", "Showing trends over time"], a: 1, why: "Color encodes magnitude poorly for reading values but well for perceiving structure." },
          { lvl: 3, q: "Which dashboard element does the most work for a busy reader?", opts: ["A large number tile", "A number with its target, trend direction, and a status indicator when it breaches threshold", "A detailed table", "A time-range selector"], a: 1, why: "Encoding state removes the comparison work the reader would otherwise have to do themselves." },
          { lvl: 4, q: "A line chart over a categorical x-axis is misleading because:", opts: ["Lines are harder to read", "Connecting the points implies continuity and ordering between categories that does not exist", "Colors cannot be distinguished", "It requires sorting"], a: 1, why: "The line asserts a relationship between adjacent categories that is an artifact of arbitrary ordering." },
          { lvl: 4, q: "Your chart uses red and green to distinguish two series. The main accessibility problem is:", opts: ["Poor contrast on white", "Red-green color blindness affects roughly 8% of men, making the series indistinguishable", "Cultural associations", "Print reproduction"], a: 1, why: "Encoding meaning in red versus green alone excludes a substantial share of readers; add a second channel such as shape or position." },
          { lvl: 5, q: "Stakeholders keep exporting your dashboard into their own spreadsheets. The most useful interpretation is:", opts: ["They prefer Excel", "The dashboard does not answer their actual question, so they are rebuilding the analysis themselves", "They need training", "The export feature is too convenient"], a: 1, why: "Export behavior is a direct signal of an unmet analytical need and the fastest route to a better dashboard." },
          { lvl: 5, q: "A monthly report chart shows a dramatic rise. Before publishing, the highest-value check is:", opts: ["Color palette consistency", "Whether the axis baseline, the scale, and the completeness of the final period could be creating or exaggerating the rise", "Font sizing", "Chart title wording"], a: 1, why: "Truncated axes and partial final periods are the two most common sources of an apparent dramatic movement." }
        ],
        project: {
          title: "Rebuild a bad dashboard",
          brief: "Find a dashboard with too many tiles. Identify the three decisions it should support, rebuild it around those with targets and status encoding, and document every chart type change with the perceptual reason."
        }
      },
      {
        id: "python-da",
        name: "Python for Data Analysis",
        lens: "pandas, joins, aggregation, reproducibility",
        summary: "Python for analysis, not software engineering: reshaping data in pandas, merges that do not silently duplicate, and notebooks someone else can re-run.",
        lessons: [
          {
            title: "Reshaping and the split-apply-combine pattern",
            body: "Most pandas work is one pattern: split the data into groups, apply a function to each, and combine the results. df.groupby('region')['revenue'].sum() is the whole pattern in one line.\n\nThe operations worth knowing well are groupby with multiple aggregations via .agg(), pivot_table for cross-tabulation with an explicit aggfunc, and melt for going from wide to long, which is usually the shape you need before plotting or grouping.\n\nThe reflex worth building is checking .shape before and after every reshape. A merge that changes row count unexpectedly, a groupby that produces fewer groups than expected, and a pivot that silently drops rows with null keys all announce themselves in the row count and nowhere else."
          },
          {
            title: "Merges that do not corrupt your data",
            body: "pd.merge defaults to an inner join, which silently drops non-matching rows. On a dataset you have not inspected, that can remove a meaningful share of your data without any warning.\n\nTwo habits prevent nearly every merge bug. Pass indicator=True and check the merge result's value counts, which tells you exactly how many rows matched on each side. And pass validate='one_to_one' or 'one_to_many' to make pandas raise when the relationship you assumed does not hold, rather than silently producing a cartesian expansion.\n\nThe cartesian case is the expensive one. Merging on a key with duplicates on both sides multiplies rows, and every aggregate computed afterward is wrong. The row count check catches it immediately; without it, the error can survive all the way into a published number."
          },
          {
            title: "Notebooks someone can re-run",
            body: "A notebook that only works when cells are run in a particular non-linear order is not reproducible, and the person who suffers is you, three months later.\n\nThe practical rules: restart and run all before sharing, and fix whatever breaks. Never depend on state from a deleted cell. Read data from a path defined once at the top, and never modify the source file in place. Set a random seed wherever sampling or modeling is involved.\n\nSeparate the layers: loading and cleaning, then analysis, then presentation. When cleaning logic is scattered through the analysis, nobody can tell which transformations were applied to a given number, which makes the entire notebook unreviewable. Chained assignment is worth a specific mention: df[df.x > 0]['y'] = 1 may modify a copy rather than the original, which is what SettingWithCopyWarning is telling you, and ignoring it is how silent data corruption happens."
          }
        ],
        practice: [
          {
            prompt: "After a merge your dataframe has 47,000 rows; both inputs had about 12,000. What happened and how do you diagnose it?",
            answer: "The merge key has duplicates on both sides, producing a many-to-many expansion. Diagnose it by checking df1[key].duplicated().sum() and the same on df2, and by re-running the merge with validate='one_to_one', which raises instead of expanding. Then decide what you actually want: deduplicate the key, aggregate one side to the correct grain before merging, or accept the expansion if the row-level detail is genuinely what you need."
          },
          {
            prompt: "Your notebook produces different results than it did last week with the same data. What are the likely causes?",
            answer: "Non-linear execution order leaving stale variables in memory, an unset random seed in a sampling or modeling step, a library version change altering default behavior, or a data source that updated underneath you without a pinned snapshot. Restart and run all is the first test. If results change on a clean run, it is the seed or the data. If they only differ from last week, check the source and library versions."
          }
        ],
        quiz: [
          { q: "pd.merge defaults to which join type?", opts: ["left", "inner", "outer", "cross"], a: 1, why: "Inner is the default and silently drops non-matching rows from both sides." },
          { q: "validate='one_to_one' on a merge:", opts: ["Speeds up the merge", "Raises an error if the key relationship is not actually one-to-one", "Removes duplicates", "Sorts the result"], a: 1, why: "It converts a silent data corruption into a loud failure." },
          { q: "SettingWithCopyWarning indicates:", opts: ["A performance issue", "You may be modifying a copy rather than the original dataframe", "A deprecated function", "A type mismatch"], a: 1, why: "Chained indexing can produce a copy, so the assignment silently fails to persist." }
        ],
        assessment: [
          { lvl: 1, q: "df.groupby('region')['sales'].sum() returns:", opts: ["A DataFrame with all columns", "A Series of summed sales indexed by region", "A pivot table", "A list"], a: 1, why: "Selecting a single column before aggregating yields a Series." },
          { lvl: 1, q: "To go from wide format to long format, use:", opts: ["pivot", "melt", "merge", "concat"], a: 1, why: "melt unpivots columns into rows, which is the shape most grouping and plotting expects." },
          { lvl: 2, q: "A left merge produces NaN in columns from the right frame. This means:", opts: ["The merge failed", "Those left rows had no match on the right, which is expected behavior", "The key types differ", "The right frame is empty"], a: 1, why: "A left join preserves all left rows and null-extends unmatched ones by design." },
          { lvl: 2, q: "Merging on a key where one side stores integers and the other strings will:", opts: ["Cast automatically", "Match nothing, producing an empty or fully null result", "Raise an error immediately", "Match approximately"], a: 1, why: "Type mismatch on the key is a frequent and silent cause of zero matches." },
          { lvl: 3, q: "Row count jumps from 12,000 to 47,000 after a merge. The cause is:", opts: ["A bug in pandas", "Duplicate keys on both sides producing a many-to-many expansion", "An outer join", "Index misalignment"], a: 1, why: "Many-to-many merges multiply rows, invalidating every subsequent aggregate." },
          { lvl: 3, q: "In a pivot_table, omitting aggfunc gives you:", opts: ["An error", "The mean by default, which is often not what you intended", "The sum", "The first value"], a: 1, why: "The mean default silently changes the meaning of the table when you expected a sum or a count." },
          { lvl: 4, q: "Your notebook works for you but fails for a colleague on the same data. The most likely cause is:", opts: ["Hardware differences", "Hidden state from non-linear cell execution, or an unpinned dependency or absolute path", "Data corruption", "Python version"], a: 1, why: "Reproducibility failures cluster around execution state, environment, and paths." },
          { lvl: 4, q: "To compute a group-level statistic and keep every original row, use:", opts: ["groupby().agg()", "groupby().transform()", "groupby().apply()", "pivot_table()"], a: 1, why: "transform broadcasts the group result back to the original shape, which agg does not." },
          { lvl: 5, q: "A cleaning step in your notebook drops 4% of rows. The most important practice is:", opts: ["Drop them silently for a clean dataset", "Log the count and the reason, and verify the dropped rows are not systematically different from those kept", "Impute them", "Keep them with nulls"], a: 1, why: "Systematically different dropped rows introduce bias that no downstream analysis can detect." },
          { lvl: 5, q: "Your analysis will be re-run monthly by someone else. The highest-value investment is:", opts: ["Faster code", "A single parameterized entry point, pinned dependencies, explicit data-quality assertions, and logged row counts at each stage", "More visualizations", "More inline comments"], a: 1, why: "Recurring analyses fail on inputs changing silently. Assertions and logged counts surface that immediately; comments do not." }
        ],
        project: {
          title: "Reproducible analysis notebook",
          brief: "Build an analysis from a raw CSV that runs clean on restart-and-run-all, with validated merges, logged row counts at each stage, data-quality assertions, and a parameterized date range."
        }
      },
      {
        id: "cleaning-da",
        name: "Data Cleaning & Validation",
        lens: "Missingness, duplicates, outliers, quality checks",
        summary: "Cleaning is where analytical integrity is won or lost. This track covers diagnosing why data is missing, deduplication that does not destroy information, and building quality checks that run every time.",
        lessons: [
          {
            title: "Missingness has a mechanism",
            body: "The question is never just how much data is missing, it is why. Missing completely at random means the missingness is unrelated to anything, and dropping those rows is safe. Missing at random means it depends on other observed variables, such as a field that mobile users skip, and it can be handled with modeling or stratification. Missing not at random means it depends on the unobserved value itself, such as high earners declining to state income, and that is the dangerous case because no imputation method can fix it.\n\nDiagnose by comparing rows with and without the missing field across other variables. If they differ systematically, you are not in the random case.\n\nThe practical consequence: dropping rows with missing values is only safe in the first case, and mean imputation, which is the most common approach, understates variance and distorts relationships in every case."
          },
          {
            title: "Duplicates are rarely exact",
            body: "Exact duplicates are the easy case and drop_duplicates handles them. The hard case is near-duplicates: the same customer as 'Acme Corp', 'Acme Corporation', and 'ACME Corp.', or the same event logged twice with timestamps a few milliseconds apart.\n\nThe method is to define the identity key deliberately. What makes two records the same thing? Then normalize the fields in that key: case, whitespace, punctuation, and known variants. Only then deduplicate.\n\nAnd keep the right record rather than an arbitrary one. Sorting by a recency or completeness criterion before dropping determines which version survives, and defaulting to whatever order the data happened to arrive in is how the stale version wins. Record how many rows were removed, because a deduplication that removes 30% of your data is telling you something about the pipeline upstream."
          },
          {
            title: "Validation that runs every time",
            body: "Manual inspection catches problems once. Assertions catch them every time the pipeline runs, which is what you need when an analysis recurs.\n\nThe checks worth writing for almost any dataset: row count within an expected range, no nulls in columns that must be populated, primary key actually unique, numeric values within plausible bounds, categorical values within a known set, and dates within the expected window. Each is one line and each has caught real incidents in real pipelines.\n\nFail loudly. A pipeline that silently proceeds with a bad month of data publishes wrong numbers that someone acts on. The expensive outcome is not a failed job, it is a decision made on corrupted data, and that is what assertions are protecting against. Log the checks that passed too, so a reviewer can see what was verified rather than assuming."
          }
        ],
        practice: [
          {
            prompt: "20% of income values are missing. How do you decide what to do?",
            answer: "First diagnose the mechanism by comparing rows with and without income across every other variable you have: region, product, tenure, channel. If they look the same, dropping is defensible. If the missing group differs systematically, dropping biases the analysis. Income specifically is a classic missing-not-at-random case, where the probability of missingness depends on the value itself, and no imputation method recovers that. In that case, report the analysis with the limitation stated explicitly rather than imputing and presenting it as complete."
          },
          {
            prompt: "Your deduplication removed 30% of rows. Is that success?",
            answer: "It is a signal to investigate, not a win. Verify the identity key is correct, because an overly loose key merges genuinely distinct records. If the key is right, a 30% duplication rate is an upstream pipeline problem: double-writes, a retry loop, or a backfill that ran twice. Fixing the source is worth far more than cleaning the symptom every month, and until it is fixed you should log the rate each run so a change in it is visible."
          }
        ],
        quiz: [
          { q: "Missing not at random means:", opts: ["Missingness is unrelated to anything", "Missingness depends on other observed variables", "Missingness depends on the unobserved value itself", "Data was lost in transfer"], a: 2, why: "This is the case no imputation method can correct, because the information needed is exactly what is missing." },
          { q: "Mean imputation primarily distorts:", opts: ["The mean", "Variance and the relationships between variables", "Row counts", "Data types"], a: 1, why: "Filling with the mean preserves the mean while artificially shrinking spread and weakening correlations." },
          { q: "Before deduplicating near-duplicate company names you should:", opts: ["Sort alphabetically", "Normalize case, whitespace, and punctuation, and define the identity key deliberately", "Drop the shortest name", "Use exact matching"], a: 1, why: "Deduplication is only as good as the identity definition and the normalization that precedes it." }
        ],
        assessment: [
          { lvl: 1, q: "The safest missingness case for simply dropping rows is:", opts: ["Missing completely at random", "Missing at random", "Missing not at random", "All are equally safe"], a: 0, why: "Only MCAR guarantees the remaining sample stays representative." },
          { lvl: 1, q: "An outlier should be removed when:", opts: ["It is more than 3 standard deviations out", "It is verified to be an error rather than a genuine extreme value", "It affects the mean", "It is in the top 1%"], a: 1, why: "Genuine extremes often carry the most important information; removal requires evidence of error." },
          { lvl: 2, q: "Comparing rows with and without a missing field across other variables tests:", opts: ["Data type consistency", "Whether missingness is systematic rather than random", "Duplication rate", "Outlier presence"], a: 1, why: "Systematic differences rule out MCAR and change what handling is defensible." },
          { lvl: 2, q: "Which assertion would catch a partially loaded data file?", opts: ["Column names match expected", "Row count within expected range for the period", "No duplicate keys", "Data types correct"], a: 1, why: "Partial loads pass schema checks but fail volume checks, which is exactly what row count catches." },
          { lvl: 3, q: "After deduplication, which record should survive?", opts: ["The first in file order", "The one selected by an explicit rule such as most recent or most complete", "The last in file order", "It does not matter"], a: 1, why: "Arbitrary order lets stale or incomplete versions win silently." },
          { lvl: 3, q: "Timestamps in your dataset are a mix of UTC and local time. The correct fix is:", opts: ["Sort and take the earliest", "Identify the source of each and convert all to a single explicit timezone, documenting the conversion", "Strip the time component", "Use the date only"], a: 1, why: "Mixed timezones corrupt every period boundary and ordering; only explicit normalization resolves it." },
          { lvl: 4, q: "A monthly pipeline silently produced a report on half a month of data. The control that would have caught this is:", opts: ["Schema validation", "A row count or date-coverage assertion that fails the run", "Type checking", "Null checking"], a: 1, why: "Volume and coverage checks are the only ones that detect completeness failures." },
          { lvl: 4, q: "Your categorical column suddenly contains a value never seen before. The best handling is:", opts: ["Map it to the most common category", "Fail or flag the run, since an unexpected category often signals an upstream change", "Drop those rows", "Create an 'other' bucket silently"], a: 1, why: "Silent bucketing hides upstream schema or business-process changes that need to be understood." },
          { lvl: 5, q: "Cleaning decisions in your pipeline are undocumented. The primary risk is:", opts: ["Slower execution", "Nobody can determine which transformations produced a given number, so results cannot be audited or reproduced", "Larger file size", "Version conflicts"], a: 1, why: "Undocumented transformation chains make every downstream number unverifiable." },
          { lvl: 5, q: "Which is the strongest overall data quality practice for a recurring analysis?", opts: ["Manual review each run", "Automated assertions on volume, uniqueness, nulls, ranges, and category membership that fail the run loudly, with results logged", "More thorough initial cleaning", "Storing raw backups"], a: 1, why: "Automated failing checks are the only practice that scales and that catches problems before a decision is made on bad data." }
        ],
        project: {
          title: "Quality harness for a messy dataset",
          brief: "Take a genuinely messy dataset. Document the missingness mechanism for each incomplete field, define the identity key for deduplication, and write a validation suite of at least eight assertions that fails loudly on bad input."
        }
      }
    ]
  }
);
