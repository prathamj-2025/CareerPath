/* CareerPath demo content library.
   Every skill is role-specific: the same named skill (SQL) carries different
   lessons and different question banks in each career track. */

window.CP_LEVELS = [
  { stars: 0, label: "Not yet passed", min: 0 },
  { stars: 1, label: "Foundation", min: 50 },
  { stars: 2, label: "Basic application", min: 65 },
  { stars: 3, label: "Job-ready proficiency", min: 75 },
  { stars: 4, label: "Advanced application", min: 85 },
  { stars: 5, label: "Practical mastery", min: 95 }
];

window.CP_ROLES = [
  {
    id: "pm",
    name: "Product Manager",
    tagline: "Decide what to build, prove it was right.",
    skills: [
      {
        id: "sql-pm",
        name: "SQL for Product Managers",
        lens: "Funnels, retention, cohorts, experiment readouts",
        summary: "Pull your own numbers instead of queueing behind the data team. This track skips database administration entirely and drills the four query shapes a PM actually writes.",
        lessons: [
          {
            title: "Why PMs write their own SQL",
            body: "The gap between a question and an answer is where product decisions go to die. If checking whether activation dropped after Tuesday's release means filing a ticket and waiting three days, you will stop checking.\n\nA PM does not need to design schemas, tune indexes, or manage permissions. You need four query shapes: count events grouped by a dimension, measure a funnel between two events, measure retention across time, and split any of those by an experiment variant. Everything in this course is one of those four.\n\nThe practical bar: you can answer your own question in under ten minutes, and you can read a data scientist's query well enough to catch when it answers a slightly different question than the one you asked."
          },
          {
            title: "Funnels: counting users, not rows",
            body: "The most common PM SQL mistake is counting rows when you meant to count people. A user who viewed the checkout page four times is one user in the funnel, not four.\n\nThe pattern is COUNT(DISTINCT user_id) at each step, with each step filtered to the same time window and the same starting population. A funnel that lets step 2 include users who never did step 1 is not a funnel, it is two unrelated numbers next to each other.\n\nSELECT\n  COUNT(DISTINCT CASE WHEN event = 'view_cart' THEN user_id END) AS step1,\n  COUNT(DISTINCT CASE WHEN event = 'begin_checkout' THEN user_id END) AS step2,\n  COUNT(DISTINCT CASE WHEN event = 'purchase' THEN user_id END) AS step3\nFROM events\nWHERE event_date BETWEEN '2026-09-01' AND '2026-09-14';\n\nThis version is fast and usually good enough for a directional read. It does not enforce ordering, so a user who purchased before viewing a cart still counts in both. When ordering matters, you need a self-join or a window function on event timestamps."
          },
          {
            title: "Retention and cohorts",
            body: "Retention answers a different question than engagement. Engagement asks how much people use the product. Retention asks whether they come back at all.\n\nA cohort is a group defined by when they started. Week-1 retention for the September 7 cohort is the share of users who signed up that week and returned in the following week. Comparing cohorts is how you tell whether a change helped: if the cohort that signed up after the onboarding redesign retains better than the one before it, that is evidence. Comparing overall retention month to month is not, because the mix of new and old users shifts underneath you.\n\nThe shape uses DATE_TRUNC to bucket signup into a cohort, then a LEFT JOIN back to activity in later periods. The LEFT JOIN matters: an INNER JOIN silently drops the users who never came back, which are exactly the users retention is measuring."
          },
          {
            title: "Reading an experiment in SQL",
            body: "Experiment analysis in SQL is a funnel query with one extra GROUP BY on the variant column. The hard part is not the SQL, it is the traps.\n\nThree checks before you trust a readout. First, sample ratio: if the split was meant to be 50/50 and you see 52/48 on a large sample, assignment is broken and the result means nothing. Second, assignment time: users must be counted from the moment they were assigned, not from account creation, or you include activity that predates the treatment. Third, the denominator: rate metrics must divide by users assigned, not users who reached some later step, because the treatment may change who reaches that step.\n\nSELECT variant,\n  COUNT(DISTINCT user_id) AS assigned,\n  COUNT(DISTINCT CASE WHEN converted THEN user_id END) AS converted\nFROM experiment_assignments a\nLEFT JOIN conversions c USING (user_id)\nWHERE experiment = 'checkout_v3'\nGROUP BY variant;"
          }
        ],
        practice: [
          {
            prompt: "Your funnel query returns 4,200 users at 'view_cart' and 5,100 at 'begin_checkout'. Step 2 is larger than step 1. What is the most likely cause?",
            answer: "The steps are not constrained to the same population or the same ordering. Users are reaching checkout through a path that skips the cart view (a buy-now button, a saved cart, a deep link from email), so they count in step 2 without ever appearing in step 1. Fix it by defining the funnel entry population once and requiring later steps to belong to it, with timestamps in order."
          },
          {
            prompt: "A teammate sends you week-1 retention by cohort. It rises steadily for six weeks. What should you check before celebrating?",
            answer: "Whether the most recent cohorts have had a full week to return yet. Partial cohorts look artificially high or low depending on how the query counts them. Also check whether acquisition mix changed: if paid spend dropped and the remaining traffic is organic, retention rises without the product improving at all."
          }
        ],
        quiz: [
          { q: "Which aggregate belongs in a user funnel?", opts: ["COUNT(*)", "COUNT(DISTINCT user_id)", "SUM(events)", "COUNT(event_id)"], a: 1, why: "A funnel measures people, so distinct users. COUNT(*) counts rows, inflating steps where users repeat an action." },
          { q: "Why use LEFT JOIN rather than INNER JOIN in a retention query?", opts: ["It runs faster", "It keeps users who did not return, which retention is measuring", "It avoids duplicate rows", "It is required for DATE_TRUNC"], a: 1, why: "An INNER JOIN drops non-returning users, so retention would compute as 100% every time." },
          { q: "A rate metric in an experiment readout should divide by:", opts: ["Users who reached the step above it", "Users assigned to the variant", "Total daily active users", "Users who completed the funnel"], a: 1, why: "Dividing by a later step lets the treatment change the denominator, which biases the comparison." }
        ],
        assessment: [
          { lvl: 1, q: "You need daily signups for September split by acquisition channel. Which clause groups the output correctly?", opts: ["ORDER BY signup_date, channel", "GROUP BY signup_date, channel", "PARTITION BY signup_date", "HAVING channel IS NOT NULL"], a: 1, why: "GROUP BY defines the output grain. ORDER BY only sorts, and PARTITION BY belongs to window functions." },
          { lvl: 1, q: "Which filter keeps only rows from the last 30 days in a table with an event_date column?", opts: ["WHERE event_date > CURRENT_DATE - 30", "HAVING event_date > CURRENT_DATE - 30", "GROUP BY event_date LIMIT 30", "ORDER BY event_date DESC LIMIT 30"], a: 0, why: "WHERE filters rows before aggregation. HAVING filters groups after, and LIMIT just truncates the result set." },
          { lvl: 2, q: "Your cart-to-purchase conversion reads 140%. The most likely explanation is:", opts: ["A genuine spike from a promotion", "Purchases counted as rows while carts counted as distinct users", "The date filter is too narrow", "Currency conversion is wrong"], a: 1, why: "Mixed grain across steps is the standard cause of an impossible conversion rate: repeat purchases inflate the numerator." },
          { lvl: 2, q: "Which change makes a funnel enforce step ordering?", opts: ["Adding DISTINCT to every step", "Requiring step 2's timestamp to be greater than step 1's for the same user", "Adding an index on user_id", "Switching COUNT to SUM"], a: 1, why: "Ordering is a timestamp constraint per user, not an aggregate change." },
          { lvl: 3, q: "You are measuring whether a new onboarding flow improved week-1 retention. Which comparison is valid?", opts: ["Overall retention this month vs last month", "Cohorts that signed up after launch vs cohorts that signed up before", "Retention of users who completed onboarding vs those who did not", "Retention of paid vs organic users since launch"], a: 1, why: "Cohort-to-cohort holds the definition fixed. Completers vs non-completers is selection bias: motivated users complete onboarding anyway." },
          { lvl: 3, q: "An experiment shows 51.8% / 48.2% assignment on 240,000 users for a 50/50 split. You should:", opts: ["Accept it, the difference is small", "Investigate assignment before reading any metric", "Reweight the results to 50/50", "Extend the experiment until it balances"], a: 1, why: "A sample ratio mismatch at that scale means assignment or logging is broken, which invalidates every downstream metric. Reweighting hides the bug." },
          { lvl: 4, q: "You want each user's first purchase date alongside every order row, without collapsing the rows. The right tool is:", opts: ["GROUP BY user_id", "A window function: MIN(order_date) OVER (PARTITION BY user_id)", "A HAVING clause", "SELECT DISTINCT"], a: 1, why: "Window functions compute across a partition while preserving row-level detail. GROUP BY would collapse the orders away." },
          { lvl: 4, q: "A treatment arm shows higher conversion but lower revenue per assigned user. The most useful next query is:", opts: ["Re-run the conversion query with a longer window", "Split conversions by order value band to see if the treatment shifted mix toward cheap orders", "Check for sample ratio mismatch again", "Compare the two arms on daily active users"], a: 1, why: "Converting more people at lower value is a mix shift. Segmenting by order value tests that directly." },
          { lvl: 5, q: "Your retention chart shows a sharp drop for the most recent cohort only. Before escalating, the single most important check is:", opts: ["Whether that cohort has had the full retention window to return", "Whether the chart colors are correct", "Whether marketing spend changed", "Whether the SQL uses LEFT JOIN"], a: 0, why: "Immature cohorts almost always explain a lone recent drop. Escalating on a partial-window artifact costs credibility fast." },
          { lvl: 5, q: "A stakeholder asks for 'active users' and your query returns a number 30% above the company dashboard. The correct first move is:", opts: ["Use the dashboard number and discard yours", "Compare the two definitions: event set, dedup window, and whether internal accounts are excluded", "Average the two", "Rebuild the query from scratch"], a: 1, why: "Metric disagreements are nearly always definitional. Reconciling definitions is the work; picking a number without reconciling hides the discrepancy." }
        ],
        project: {
          title: "Checkout funnel readout",
          brief: "Write the funnel, retention, and experiment queries for a checkout redesign, then write the three-paragraph readout a VP would act on: what happened, how confident you are, and what you recommend."
        }
      },
      {
        id: "metrics-pm",
        name: "Product Metrics & Analytics",
        lens: "North star selection, guardrails, metric trees",
        summary: "Choosing what to measure is a product decision, not a reporting task. This track covers metric trees, the difference between a north star and a vanity number, and guardrails that catch harm.",
        lessons: [
          {
            title: "North star, inputs, guardrails",
            body: "A north star metric states the value the product delivers, measured in a way the team can move. Spotify's is time spent listening, not downloads. Downloads are a vanity metric: they rise with marketing spend and fall to zero as a signal once acquisition slows.\n\nUnder the north star sits a metric tree of inputs the team controls directly. If the north star is weekly active creators, inputs might be new creator activation rate, creation session frequency, and creator churn. Each input has an owner and a roadmap item.\n\nGuardrails are the metrics you are not trying to move but refuse to break: page load time, support ticket volume, refund rate, unsubscribe rate. A launch that moves the north star while breaking a guardrail is not a win, and the guardrail is what stops a team from optimizing itself into harm."
          },
          {
            title: "Leading and lagging",
            body: "Revenue is a lagging metric. By the time it moves, the decision that caused it was made two quarters ago. Leading metrics move first and predict the lagging one: trial-to-paid conversion leads revenue, activation rate leads retention, retention leads lifetime value.\n\nThe practical use is cycle time. A team that steers on lagging metrics gets one feedback signal a quarter. A team that has validated which leading metric predicts its lagging one gets a signal every week.\n\nValidating that link is real work. Correlation across a handful of weeks is not enough. The stronger test is whether deliberate changes to the leading metric reliably move the lagging one later, which is a question experiments can answer."
          },
          {
            title: "Segmentation before conclusions",
            body: "An aggregate metric hides the thing you need to know. Overall conversion flat can mean two segments moving in opposite directions, and averaging them into one flat line erases the story.\n\nThree splits earn their keep on almost any metric: new versus returning, platform, and acquisition channel. Simpson's paradox is the sharp edge here: a metric can improve in every segment while the overall number declines, purely because the mix shifted toward a lower-performing segment. Reporting only the aggregate in that case tells your leadership the opposite of what happened.\n\nThe discipline is to look at the segments before writing the conclusion, not after someone questions it."
          }
        ],
        practice: [
          {
            prompt: "A marketplace PM proposes 'number of listings' as the north star. Argue the counter-case and propose a better one.",
            answer: "Listings measure supply-side activity, not delivered value, and they are easy to inflate with low-quality or duplicate listings that make search worse. A better north star is completed transactions, or gross merchandise value from repeat buyers, since both require supply and demand to actually meet. Keep listings as an input metric in the tree, with listing quality as a guardrail."
          },
          {
            prompt: "Mobile conversion rose 8%, desktop rose 5%, overall conversion fell 2%. Explain how, and what you report.",
            answer: "Mix shift. Traffic moved toward mobile, which converts at a structurally lower rate than desktop, so the weighted average fell even though both segments improved. This is Simpson's paradox. Report both segments improving, name the mix shift as the driver of the aggregate, and then treat the mobile traffic growth as its own question rather than burying it."
          }
        ],
        quiz: [
          { q: "Which is a guardrail metric for a recommendation feed launch?", opts: ["Feed engagement", "Session length", "Content report rate", "Daily active users"], a: 2, why: "Guardrails catch harm you are not trying to cause. A feed that raises engagement while raising reported content is not a win." },
          { q: "Downloads as a primary success metric is a problem because:", opts: ["It is hard to measure", "It reflects acquisition spend rather than delivered value", "It updates too slowly", "It cannot be segmented"], a: 1, why: "Vanity metrics track effort into the top of the funnel rather than value delivered to users." },
          { q: "Overall metric flat, both segments up. The cause is usually:", opts: ["A logging bug", "A mix shift between segments", "Seasonality", "An outlier user"], a: 1, why: "This is the standard signature of Simpson's paradox: the weighting changed, not the performance." }
        ],
        assessment: [
          { lvl: 1, q: "A north star metric should primarily reflect:", opts: ["Revenue this quarter", "Value delivered to users that the team can influence", "Total registered accounts", "Engineering velocity"], a: 1, why: "It has to represent delivered value and be movable by the team, or it cannot steer decisions." },
          { lvl: 1, q: "Which of these is a lagging metric?", opts: ["Activation rate", "Trial-to-paid conversion", "Annual recurring revenue", "Time to first value"], a: 2, why: "ARR is an outcome that confirms earlier decisions long after they were made." },
          { lvl: 2, q: "Your team's north star is weekly active teams. Which belongs in the input layer of the metric tree?", opts: ["Company valuation", "Invite acceptance rate", "Server uptime", "Marketing headcount"], a: 1, why: "Inputs are levers the team pulls directly that roll up to the north star. Uptime is a guardrail, not an input." },
          { lvl: 2, q: "Support ticket volume rose 40% after a launch that improved the primary metric. The right response is:", opts: ["Ship it, the primary metric won", "Treat the guardrail breach as a blocker and investigate before further rollout", "Ignore it, support scales separately", "Remove the guardrail since the launch succeeded"], a: 1, why: "Guardrails exist precisely for launches that look like wins on the primary metric." },
          { lvl: 3, q: "You need a leading metric for subscription revenue. The strongest candidate is one that:", opts: ["Correlates with revenue over the last three weeks", "Has historically moved before revenue and responded to deliberate product changes", "Is easiest to instrument", "Leadership already reports"], a: 1, why: "A leading metric must be both predictive and manipulable, which requires evidence from actual changes, not short-window correlation." },
          { lvl: 3, q: "Activation is defined as 'completed onboarding'. A PM proposes redefining it as 'performed the core action twice in week one'. The main risk of the change is:", opts: ["The new definition is harder to query", "Historical comparisons break unless you backfill the new definition", "Onboarding becomes unimportant", "It will always produce a lower number"], a: 1, why: "Redefinition without backfill destroys the time series, which is usually the whole point of tracking it." },
          { lvl: 4, q: "Aggregate retention improved 3 points. Every acquisition channel's retention declined. The most accurate statement to leadership is:", opts: ["Retention improved", "Retention declined in every channel; the aggregate rose because acquisition mix shifted toward higher-retaining channels", "The data is wrong", "Retention is flat"], a: 1, why: "Reporting only the aggregate would tell leadership the opposite of what the product did." },
          { lvl: 4, q: "A team optimizes notification click-through and hits its target. Which guardrail most likely caught real harm?", opts: ["Notification send volume", "Notification opt-out rate", "App store rating count", "Daily active users"], a: 1, why: "Opt-out rate captures the cost users pay to escape, which CTR optimization tends to push up." },
          { lvl: 5, q: "You inherit a dashboard where every metric is up and to the right, yet churn is rising. The most likely structural problem is:", opts: ["The dashboard has a bug", "The metrics measure activity rather than delivered value, and no guardrail covers churn drivers", "Churn is seasonal", "Too many metrics are tracked"], a: 1, why: "Activity metrics can all rise while the product delivers less value per user. Missing guardrails is why nothing caught it." },
          { lvl: 5, q: "Two teams report different values for the same metric and both refuse to change. As PM, the durable fix is:", opts: ["Pick the higher number for external reporting", "Publish a single definition with owner, query, and exclusions, and deprecate the other", "Report both with a footnote", "Escalate to leadership for a decision"], a: 1, why: "Metric disagreements are governance problems. One owned definition ends the dispute permanently; footnotes and escalation do not." }
        ],
        project: {
          title: "Metric tree for a real product",
          brief: "Pick a product you use. Write its north star, three input metrics with owners, and three guardrails. Defend why each guardrail would catch a specific failure mode."
        }
      },
      {
        id: "discovery-pm",
        name: "User Discovery & Research",
        lens: "Interview technique, JTBD, synthesis",
        summary: "Talking to users is a skill with technique, not a personality trait. This track covers question design, the Mom Test, jobs-to-be-done framing, and turning transcripts into decisions.",
        lessons: [
          {
            title: "The questions that get honest answers",
            body: "Users are polite. Ask whether they would use a feature and most will say yes, because saying no to an enthusiastic person is uncomfortable. That yes costs you nothing to collect and tells you nothing.\n\nThe Mom Test rule: ask about their past behavior, not their future intentions. 'Would you pay for this?' produces flattery. 'Walk me through the last time you had this problem' produces evidence. 'What did you do about it?' produces the strongest evidence of all, because a workaround someone built themselves is a problem worth paying to solve.\n\nWatch for compliments, hypotheticals, and generalizations. Those are the three shapes of useless data. When someone says 'I usually...', slow down and ask about the specific most recent time instead."
          },
          {
            title: "Jobs to be done",
            body: "JTBD reframes the unit of analysis from the user to the situation. People do not buy a drill because they are the kind of person who owns drills. They hire a drill when they need a hole, and they fire it the moment something easier produces the hole.\n\nThe practical value is competitive scope. If your job statement is 'when I am commuting, help me feel less bored,' your competition is podcasts, games, social feeds, and staring out the window, not just the other apps in your category. Teams that define competitors by category consistently miss the substitute that actually takes their users.\n\nA usable job statement has a situation, a motivation, and an outcome: when [situation], I want to [motivation], so I can [outcome]. If you cannot fill the situation slot from an actual interview, you are guessing."
          },
          {
            title: "From transcripts to decisions",
            body: "Synthesis is where most research dies. Eight good interviews sit in a folder, someone writes a summary nobody reads, and the roadmap does not change.\n\nThe working method is to tag at the observation level, not the interview level. Each concrete observation gets a tag, tags cluster into patterns, and a pattern only counts when it shows up across independent participants. One vivid quote is an anecdote regardless of how memorable it was.\n\nThen the output has to be a decision input, not a report. Name the pattern, say how many participants it appeared in, say what it implies for the roadmap, and state what would change your mind. Research that cannot be wrong cannot be useful."
          }
        ],
        practice: [
          {
            prompt: "Rewrite this interview question to pass the Mom Test: 'Would you use a feature that automatically categorized your expenses?'",
            answer: "'Tell me about the last time you categorized expenses. Walk me through what you actually did.' Follow with 'How long did that take?' and 'What did you do when it went wrong?' The rewrite asks about a specific past behavior instead of a hypothetical future one, and the follow-ups surface the cost of the current workaround."
          },
          {
            prompt: "Three of eight participants mentioned wanting dark mode, unprompted. Is that a pattern worth acting on?",
            answer: "It is a real signal but weak as a priority input. Unprompted mentions from three independent participants beat a single request, but wanting dark mode says nothing about the job they are hiring the product for, and preference requests are cheap to voice. Log it, and weigh it against patterns that connect to a job or a blocked outcome. Do not let mention count alone drive the roadmap."
          }
        ],
        quiz: [
          { q: "Which question produces the most reliable evidence?", opts: ["Would you pay $10 a month for this?", "Do you like this design?", "Walk me through the last time you dealt with this problem", "How often do you usually do this?"], a: 2, why: "Specific past behavior resists politeness bias and faulty recall better than intentions or generalizations." },
          { q: "A user built their own spreadsheet workaround. This signals:", opts: ["They are an edge case", "The problem is painful enough to justify effort", "They dislike your product", "They need training"], a: 1, why: "Self-built workarounds are the strongest organic evidence of willingness to pay." },
          { q: "In a JTBD statement, the situation slot exists to:", opts: ["Make the sentence longer", "Define the context that triggers the job, which sets the real competitive set", "Identify the persona", "Describe the feature"], a: 1, why: "The trigger context determines what users compare you against, including substitutes outside your category." }
        ],
        assessment: [
          { lvl: 1, q: "The Mom Test is primarily a rule about:", opts: ["Interviewing family members", "Asking about past behavior rather than future intentions", "Recruiting a representative sample", "Limiting interviews to 30 minutes"], a: 1, why: "The rule targets question design, specifically avoiding hypotheticals that invite flattery." },
          { lvl: 1, q: "Which is a leading question?", opts: ["What happened next?", "Don't you find the current process frustrating?", "How did you handle that?", "When was the last time?"], a: 1, why: "It supplies the emotion and invites agreement rather than letting the participant describe their own experience." },
          { lvl: 2, q: "A participant says 'I'd definitely use that.' The best follow-up is:", opts: ["Great, thanks", "What do you do about this problem today?", "How much would you pay?", "Which competitor do you use?"], a: 1, why: "Redirecting to current behavior converts a hypothetical into evidence you can evaluate." },
          { lvl: 2, q: "You have budget for six interviews. The best recruiting approach is:", opts: ["Six of your most enthusiastic power users", "A mix spanning the behaviors you are trying to understand, including people who churned", "Six people from the largest customer", "Whoever responds first"], a: 1, why: "Sampling only enthusiasts guarantees confirmation. Churned users hold the information that changes decisions." },
          { lvl: 3, q: "Across eight interviews, one participant described a vivid, specific failure that no one else mentioned. You should:", opts: ["Treat it as a top priority because it was specific", "Log it as a single-source observation and look for it deliberately in the next round", "Discard it", "Build a feature for it immediately"], a: 1, why: "Vividness is not frequency. Testing it deliberately in the next round is how a single observation earns or loses weight." },
          { lvl: 3, q: "Which job statement is usable?", opts: ["Users want a better dashboard", "When I get a Monday exec request, I want last week's numbers in one place, so I can answer within the hour", "Millennials prefer mobile-first design", "Customers need more integrations"], a: 1, why: "It names situation, motivation, and outcome, which makes it testable and sets the competitive scope." },
          { lvl: 4, q: "Your interviews and your usage analytics disagree about where users struggle. The right interpretation is:", opts: ["Analytics is objective, so interviews are wrong", "Interviews reveal intent, analytics reveals behavior; the gap itself is the finding worth investigating", "Run more interviews until they agree", "Average the two"], a: 1, why: "The disagreement usually marks a place where users work around a problem silently, which neither source shows alone." },
          { lvl: 4, q: "A stakeholder asks you to validate a feature they have already committed to building. The most useful reframe is:", opts: ["Decline the research", "Shift from validation to risk identification: what would have to be true for this to fail, and test that", "Run the validation as asked", "Survey a large sample instead"], a: 1, why: "Validation research on a committed decision produces theater. Testing failure conditions still changes execution." },
          { lvl: 5, q: "Research consistently points away from the roadmap leadership has committed to publicly. The most effective path is:", opts: ["Present the findings as-is and wait", "Frame findings around the risk to the committed outcome, with the smallest test that would resolve the disagreement", "Soften the findings", "Escalate over your manager"], a: 1, why: "Findings that threaten a public commitment get rejected on their framing. Tying them to the committed outcome and proposing a cheap test makes the decision reversible rather than confrontational." },
          { lvl: 5, q: "Which synthesis output is most likely to change a roadmap?", opts: ["A 30-page report with full transcripts", "A pattern list with participant counts, roadmap implications, and what evidence would overturn each", "A highlight reel of the best quotes", "A persona deck"], a: 1, why: "Decision-ready synthesis names frequency, implication, and falsifiability. The other formats are consumed and forgotten." }
        ],
        project: {
          title: "Five interviews, one decision",
          brief: "Run five discovery interviews on a problem you care about. Deliver tagged observations, the patterns that appeared across at least three participants, and one roadmap recommendation with its falsifying condition."
        }
      },
      {
        id: "prioritization-pm",
        name: "Prioritization & Roadmapping",
        lens: "RICE, opportunity cost, sequencing, saying no",
        summary: "Frameworks are a way to make reasoning visible, not a way to outsource judgment. This track covers RICE and its failure modes, sequencing under dependency, and defending a roadmap to stakeholders.",
        lessons: [
          {
            title: "RICE and where it breaks",
            body: "RICE scores an item as Reach times Impact times Confidence, divided by Effort. Its real value is not the number. It is that four people arguing about a score are forced to say which input they disagree on, which is a far more productive argument than 'I think this matters more.'\n\nThree failure modes. Confidence is the input people fudge: a 50% confidence on a guess and a 50% on a tested assumption are not the same thing, and the score cannot tell them apart. Effort estimates come from the team that will do the work, and asking a team to estimate work they do not want produces conveniently large numbers. And RICE is blind to sequencing: a platform investment that unlocks the next four items scores badly on its own because its reach is zero until the things it enables ship.\n\nUse RICE to surface disagreement, then override it deliberately and say so."
            },
          {
            title: "Sequencing beats scoring",
            body: "A ranked list is not a roadmap. Two items scoring 40 and 38 are indistinguishable given the precision of the inputs, but if the 38 unblocks three later items and the 40 does not, the order is obvious and no score will tell you that.\n\nSequencing questions worth asking on every roadmap: what does this unblock, what decays if we delay it, what has a fixed external date, and what does the team learn by shipping it. That last one matters most for uncertain bets. Shipping a small version early buys information that changes every subsequent estimate, which is worth more than the feature itself.\n\nThe practical output is a roadmap with a stated sequencing logic, so when someone asks why item four is above item two, the answer is a reason rather than a score."
          },
          {
            title: "Saying no without burning the relationship",
            body: "Most stakeholder conflict comes from a no that sounds like a judgment about the person's priorities. The move is to make the tradeoff visible instead of defending your ranking.\n\nThree reframes that work. Name the opportunity cost concretely: not 'we can't do that' but 'we can do that in Q1 if we drop the billing migration, which pushes enterprise renewals to Q2.' Ask what outcome they are protecting, which often has a cheaper solution than the feature they requested. And offer a decision date rather than a rejection: 'we will revisit this at the January planning cycle with the data from the pilot.'\n\nWhat does not work: hiding behind a framework score. Stakeholders correctly read that as a refusal to engage, and it costs you the relationship you will need next quarter."
          }
        ],
        practice: [
          {
            prompt: "An engineer estimates a feature at 8 weeks. A second engineer says 2. How do you resolve it?",
            answer: "The gap is almost never about speed, it is about scope. Get both to describe what they think is in scope: the 8-week estimate probably includes migration, backfill, or edge cases the 2-week estimate assumes away. Resolve the scope question first, then re-estimate. If the gap survives an aligned scope, the difference is risk assessment, and that is worth surfacing to the whole team."
          },
          {
            prompt: "Sales escalates a feature for one large prospect. RICE scores it near the bottom. What do you do?",
            answer: "Separate the deal risk from the product value. Ask what the deal is worth, whether the feature is a genuine blocker or a preference, and whether a manual workaround or a contractual commitment closes it. If it is a real blocker on a material deal, that is a business input RICE does not capture, and overriding the score is legitimate as long as you say out loud that you are overriding it and why. What is not legitimate is quietly inflating the reach number to make the framework agree with you."
          }
        ],
        quiz: [
          { q: "RICE's most commonly manipulated input is:", opts: ["Reach", "Impact", "Confidence", "Effort"], a: 2, why: "Confidence has no natural unit and no audit trail, which makes it the easiest number to set to whatever produces the desired ranking." },
          { q: "A platform investment scores poorly in RICE because:", opts: ["Its effort is always high", "Its reach is near zero until the work it unlocks ships", "Confidence cannot be estimated", "Impact is qualitative"], a: 1, why: "RICE scores items independently and cannot see the value an enabler creates downstream." },
          { q: "The most effective response to a stakeholder request you must decline is:", opts: ["Show them the RICE score", "State the concrete tradeoff and offer a decision date", "Escalate to your manager", "Add it to the backlog quietly"], a: 1, why: "Making the tradeoff visible respects their priority while keeping the decision honest. A score reads as a dodge." }
        ],
        assessment: [
          { lvl: 1, q: "In RICE, Effort sits in the denominator because:", opts: ["Effort is the least reliable input", "Higher cost should lower priority for the same benefit", "Engineering owns the estimate", "It normalizes the score to 100"], a: 1, why: "RICE expresses value per unit of cost, so cost divides." },
          { lvl: 1, q: "Reach in RICE is best expressed as:", opts: ["A 1-5 rating", "Users or events affected per time period", "Percentage of the roadmap", "Team members assigned"], a: 1, why: "Reach needs a real unit and period so items are comparable." },
          { lvl: 2, q: "Two items score 41 and 39. The correct interpretation is:", opts: ["Do the 41 first", "The scores are within noise; decide on sequencing logic instead", "Re-score both", "Split the team across both"], a: 1, why: "RICE inputs are estimates. Differences smaller than the input error carry no information." },
          { lvl: 2, q: "Which item most justifies overriding a low RICE score?", opts: ["A senior stakeholder prefers it", "It unblocks three higher-scoring items in the next quarter", "It is technically interesting", "It was promised last year"], a: 1, why: "Dependency value is real and structurally invisible to RICE, which makes it the legitimate override." },
          { lvl: 3, q: "Your team consistently overestimates effort on work it dislikes. The structural fix is:", opts: ["Halve their estimates", "Estimate in relative sizes against completed reference work, and track estimate accuracy openly", "Have the PM estimate instead", "Remove Effort from RICE"], a: 1, why: "Reference-class estimation with visible accuracy tracking corrects bias without accusing anyone." },
          { lvl: 3, q: "A quarterly roadmap is fully committed with no slack. The most likely consequence is:", opts: ["Maximum throughput", "Any discovery, incident, or dependency slip cascades into missed commitments", "Better stakeholder confidence", "Lower engineering cost"], a: 1, why: "Full utilization removes the buffer that absorbs normal variance, so delays compound rather than absorb." },
          { lvl: 4, q: "A feature has high impact if an assumption holds and near-zero if it does not. The right move is:", opts: ["Score it at average confidence and rank normally", "Sequence the cheapest test of that assumption first, then re-decide", "Drop it", "Build the full version to find out"], a: 1, why: "Buying information is cheaper than buying the feature when the variance is driven by one assumption." },
          { lvl: 4, q: "Leadership asks for a 12-month feature-level roadmap. The most professional response is:", opts: ["Provide it as requested", "Provide committed detail for the near term and outcome-level themes beyond it, and explain why feature-level precision that far out is fiction", "Refuse", "Provide it with every date marked tentative"], a: 1, why: "Horizon-appropriate granularity gives leadership real planning input without manufacturing false precision." },
          { lvl: 5, q: "Two directors each escalate a different must-have for the same quarter. The most durable resolution is:", opts: ["Split the quarter between them", "Bring both the same tradeoff view showing what each choice displaces, and make them decide against the shared outcome", "Let your manager pick", "Take the one with the larger business unit"], a: 1, why: "Splitting delivers neither well. A shared tradeoff view moves the decision to the people who own the competing outcomes." },
          { lvl: 5, q: "Your roadmap was right on value but the team missed every date. The most likely root cause worth fixing first is:", opts: ["Prioritization framework choice", "Estimation and capacity planning, including unplanned work absorption", "Stakeholder communication", "Team skill level"], a: 1, why: "Correct priorities with missed dates points at capacity modeling, not at ranking. Unplanned work is the usual uncounted load." }
        ],
        project: {
          title: "Defend a contested quarter",
          brief: "Take a real backlog of ten items. Produce RICE scores, then a sequenced roadmap that deliberately departs from the ranking, with a written defense of each departure and the tradeoff you would present to the stakeholder who loses."
        }
      },
      {
        id: "prd-pm",
        name: "PRDs & Product Specs",
        lens: "Problem framing, requirements, edge cases, acceptance criteria",
        summary: "A spec exists to let a team build the right thing without you in the room. This track covers problem statements, acceptance criteria that catch ambiguity, and the edge cases that cause rework.",
        lessons: [
          {
            title: "Problem before solution",
            body: "A PRD that opens with a solution has already lost the argument it needed to win. The opening section states the problem, who has it, how you know, and what happens if nothing changes. If you cannot write that section without referencing the feature, you do not yet have a problem statement.\n\nThe test engineers apply, consciously or not: can I tell whether my proposed alternative solves this? If the problem is stated as 'users need a bulk export button,' no alternative is evaluable. If it is stated as 'operations teams re-key an average of 200 records a week because there is no way to move data out,' an engineer can propose an API, a scheduled email, or a button, and you can judge all three.\n\nThis is also what protects the spec from scope creep. Every addition has to argue against the stated problem, not against your taste."
          },
          {
            title: "Acceptance criteria that actually catch ambiguity",
            body: "Most acceptance criteria restate the feature. 'User can filter the list' tells QA nothing they did not already know and passes trivially.\n\nWriteable criteria are observable and falsifiable. Given a list of 10,000 records, when the user applies two filters, then the result set returns within 2 seconds and the count reflects both filters. Each clause is something that can fail visibly.\n\nThe highest-value criteria cover what happens when things go wrong: empty states, permission denials, partial failures, and concurrent edits. These are the cases that get discovered in code review and cause a week of rework, and they cost you ten minutes to write down. A useful habit is to write the failure criteria before the success ones, because the success path is the part everyone already has in their head."
          },
          {
            title: "What belongs outside the spec",
            body: "Specs rot because they try to be the single source of truth for everything. Design mocks change, API contracts live in code, and metric definitions belong in the metrics registry. A PRD that duplicates those goes stale within a sprint and then actively misleads people.\n\nWhat the PRD owns and nothing else does: the problem, the users, the scope boundary including an explicit out-of-scope list, the requirements with acceptance criteria, the success metric with its target, and the open questions with owners and decision dates.\n\nThe out-of-scope list does more work than any other section. It is where you record the things that were discussed and deliberately cut, which stops the same debate from restarting three times and gives you a written answer when someone asks why it was not included."
          }
        ],
        practice: [
          {
            prompt: "Turn this into a problem statement: 'We need to add SSO.'",
            answer: "'Enterprise admins cannot enforce their identity policy on our product, which blocked four of our last nine enterprise deals and forces existing admins to manually deprovision accounts when employees leave, creating a security gap they have flagged twice in QBRs.' Now an engineer can weigh SAML, SCIM, or a directory sync against the stated cost, and the deals and the deprovisioning gap give the spec its success metric."
          },
          {
            prompt: "Write three failure-path acceptance criteria for a file upload feature.",
            answer: "Given a file exceeding the size limit, when upload is attempted, then the user sees the limit and the actual file size before any upload begins. Given a network interruption at 60% progress, when connectivity returns, then the upload resumes or restarts with the partial data discarded, and the user is told which. Given a user without write permission on the destination, when they open the upload dialog, then the control is disabled with the reason stated, rather than failing after the transfer completes."
          }
        ],
        quiz: [
          { q: "A PRD's problem statement should be written so that:", opts: ["It describes the chosen solution precisely", "Alternative solutions can be evaluated against it", "It fits in one sentence", "It references the design mocks"], a: 1, why: "A problem statement that admits only one solution is a solution statement wearing a disguise." },
          { q: "Which acceptance criterion is testable?", opts: ["The page should feel fast", "Search results render within 500ms at the 95th percentile for queries under 50 characters", "Users can search effectively", "Search is intuitive"], a: 1, why: "It names an observable threshold, a percentile, and a scope condition, so it can visibly fail." },
          { q: "The out-of-scope section primarily prevents:", opts: ["Engineering overwork", "Repeated re-litigation of decisions already made", "Design inconsistency", "Metric drift"], a: 1, why: "Recording what was deliberately cut, and why, is what stops the same debate from reopening." }
        ],
        assessment: [
          { lvl: 1, q: "Which belongs in a PRD rather than elsewhere?", opts: ["Final visual design", "API endpoint schemas", "Scope boundary and out-of-scope list", "Sprint assignments"], a: 2, why: "Scope is the PRD's own material. Design and API contracts live where they are maintained." },
          { lvl: 1, q: "A requirement written as 'the system should be user-friendly' fails because:", opts: ["It is too short", "It is not observable, so it cannot pass or fail", "It uses passive voice", "It lacks a priority label"], a: 1, why: "Unfalsifiable requirements provide no test and no shared definition of done." },
          { lvl: 2, q: "Engineering asks 'what happens if the user closes the tab mid-flow?' The PRD did not say. This indicates:", opts: ["An unnecessary question", "A missing failure-path requirement that should be decided and written down", "A design problem", "An edge case to ignore"], a: 1, why: "Undocumented failure paths get decided by whoever writes the code, usually inconsistently." },
          { lvl: 2, q: "The success metric in a PRD should be set:", opts: ["After launch, based on results", "Before build, with a target and a measurement window", "By the analytics team independently", "Only for major features"], a: 1, why: "A target set after the fact cannot be missed, which makes it useless for deciding whether the work succeeded." },
          { lvl: 3, q: "Midway through build, a stakeholder requests an addition that fits the theme but not the problem statement. The correct handling is:", opts: ["Add it, it is thematically related", "Evaluate it against the stated problem; if it does not serve it, record it in out-of-scope with the reason", "Reject it without discussion", "Defer the whole spec"], a: 1, why: "The problem statement is the scope test, and recording the rejection prevents the request from returning repeatedly." },
          { lvl: 3, q: "Which open-question entry is actually useful?", opts: ["Pricing TBD", "Do we support bulk import at launch? Owner: Priya. Decision needed by Oct 3 because it changes the data model", "Need to talk to legal", "Unclear requirements"], a: 1, why: "An open question needs an owner, a date, and the consequence of not deciding, or it never gets resolved." },
          { lvl: 4, q: "A spec passes review but produces heavy rework in QA. The most likely gap is:", opts: ["Insufficient design detail", "Missing failure-path and edge-case criteria that were decided implicitly during coding", "Too few requirements", "Unclear success metric"], a: 1, why: "Rework concentrates where implicit decisions were made without a written criterion to check against." },
          { lvl: 4, q: "Two requirements in your spec conflict under a specific condition nobody noticed. The best practice that would have caught it is:", opts: ["Longer review cycle", "Walking the spec through concrete end-to-end scenarios, including conflicting ones, before sign-off", "More reviewers", "A requirements template"], a: 1, why: "Scenario walkthroughs surface interaction conflicts that clause-by-clause review structurally cannot." },
          { lvl: 5, q: "Your PRDs are thorough but engineers still build the wrong thing. The most probable cause is:", opts: ["Engineers do not read specs", "The spec documents decisions without conveying the reasoning, so engineers cannot resolve the unwritten cases correctly", "Specs are too short", "Too many stakeholders"], a: 1, why: "No spec covers every case. Conveying intent is what lets a team make the unwritten calls the way you would." },
          { lvl: 5, q: "For a genuinely uncertain bet, the most appropriate spec form is:", opts: ["A full PRD with complete requirements", "A thin spec covering the smallest shippable test, with the decision criteria for continuing or stopping", "No spec", "A design doc from engineering"], a: 1, why: "Full specs for uncertain work document guesses in detail. Scoping the spec to the learning keeps the cost proportional to the confidence." }
        ],
        project: {
          title: "Spec a feature end to end",
          brief: "Write a complete PRD for a feature in a product you use: problem with evidence, scope and out-of-scope, requirements with success and failure acceptance criteria, success metric with target, and open questions with owners and dates."
        }
      },
      {
        id: "experimentation-pm",
        name: "A/B Testing & Experimentation",
        lens: "Hypotheses, power, peeking, interpreting results",
        summary: "Running an experiment is easy. Running one whose result means something is not. This track covers hypothesis design, sample size, the peeking problem, and reading a result honestly.",
        lessons: [
          {
            title: "A hypothesis you can be wrong about",
            body: "'We think the new checkout will perform better' is not a hypothesis. It names no mechanism, no metric, and no magnitude, so no result can contradict it.\n\nA usable hypothesis has four parts: the change, the mechanism you believe causes the effect, the metric it moves, and the minimum effect that would justify shipping. 'Removing the account-creation step before payment will reduce abandonment caused by friction at the decision point, raising checkout completion by at least 2 percentage points.'\n\nThat last number does more work than people expect. It forces the conversation about whether a 0.4-point lift would actually be worth the permanent complexity of a second checkout path, and it determines your sample size. Teams that skip it end up shipping statistically significant results that are commercially meaningless."
          },
          {
            title: "Power, sample size, and duration",
            body: "Statistical power is the probability of detecting an effect that really exists. Underpowered tests are the most common waste in product experimentation: the team runs for two weeks, sees nothing, concludes the change did not work, and moves on. In reality the test could never have detected the effect size in question.\n\nSample size rises steeply as the effect you want to detect shrinks. Halving the minimum detectable effect roughly quadruples the sample needed. This is why detecting a 0.2% lift on a low-traffic flow is often simply not possible, and knowing that before you start saves weeks.\n\nDuration has its own rule independent of sample size: run at least one full week, ideally two, to cover the weekly cycle. Weekday and weekend users behave differently, and a test that ends on a Thursday has sampled a biased slice of behavior regardless of how many users it collected."
          },
          {
            title: "Peeking and the discipline of waiting",
            body: "If you check results daily and stop the moment significance appears, your actual false positive rate is far above the 5% the p-value claims. Running significance tests repeatedly on accumulating data means random fluctuation will eventually cross the threshold, and the effect you shipped was noise.\n\nThree legitimate options. Fix the sample size in advance and only test at the end, which is the simplest. Use a sequential testing method built for continuous monitoring, which adjusts the threshold to account for repeated looks. Or monitor only for guardrail breaches and hard failures, which is a different decision than declaring a winner.\n\nThe cultural problem is that stakeholders ask 'how's the test doing?' on day three. The answer worth giving is that the test has a scheduled read date and interim numbers are not interpretable, which is also why you set that date before launch."
          }
        ],
        practice: [
          {
            prompt: "A test hits p = 0.048 on day 4 of a planned 14-day run. Ship it?",
            answer: "No. Stopping early because significance appeared is exactly the peeking problem, and a p-value just under the threshold on an early look is the most likely place for a false positive to sit. Run to the planned end date. If the effect is real it will survive; if it evaporates, you learned something for free. The only reason to stop early is a guardrail breach, which is a stop decision rather than a ship decision."
          },
          {
            prompt: "Your test is significant with a 0.3% lift. The feature adds a permanent second code path. What do you recommend?",
            answer: "Compare the lift against the minimum effect you committed to before launch. If 0.3% is below it, the honest recommendation is not to ship despite significance, because significance only says the effect is probably real, not that it is worth its cost. Quantify the lift in revenue terms and weigh it against the ongoing maintenance and the risk that a second code path adds to every future change."
          }
        ],
        quiz: [
          { q: "The minimum detectable effect should be set:", opts: ["After the test concludes", "Before launch, based on what lift would justify shipping", "By the statistics team", "At 5% by convention"], a: 1, why: "It determines the sample size and prevents shipping significant but commercially trivial results." },
          { q: "Checking for significance daily and stopping at the first hit:", opts: ["Saves time with no cost", "Inflates the false positive rate well above the stated threshold", "Increases statistical power", "Is fine with large samples"], a: 1, why: "Repeated testing on accumulating data guarantees random crossings of the threshold." },
          { q: "Running a test for exactly one week rather than four days primarily controls for:", opts: ["Sample ratio mismatch", "Day-of-week behavioral differences", "Novelty effects", "Instrumentation error"], a: 1, why: "A partial week samples a biased slice of user behavior no matter how large it is." }
        ],
        assessment: [
          { lvl: 1, q: "The control group exists to:", opts: ["Reduce the cost of the test", "Provide a baseline measured over the same period and population", "Validate the instrumentation", "Satisfy compliance"], a: 1, why: "Without a concurrent baseline, any change gets attributed to the treatment rather than to time or mix." },
          { lvl: 1, q: "A p-value of 0.03 means:", opts: ["There is a 3% chance the result is wrong", "There is a 97% chance the treatment works", "If there were no real effect, data this extreme would occur about 3% of the time", "The effect size is 3%"], a: 2, why: "The p-value is a statement about data under the null hypothesis, not a probability that the hypothesis is true." },
          { lvl: 2, q: "You want to detect a smaller effect than originally planned. The sample size required:", opts: ["Decreases", "Stays the same", "Rises steeply, roughly quadrupling when the effect is halved", "Depends only on duration"], a: 2, why: "Required sample scales inversely with the square of the effect size." },
          { lvl: 2, q: "Assignment shows 50.1% / 49.9% on 800,000 users. This is:", opts: ["A sample ratio mismatch requiring investigation", "Within normal variation for a 50/50 split", "Evidence of bot traffic", "A reason to extend the test"], a: 1, why: "Small deviations at that scale are expected. SRM refers to statistically implausible imbalance, not any imbalance." },
          { lvl: 3, q: "A treatment shows a large lift in week 1 that decays to zero by week 3. The most likely explanation is:", opts: ["The test is underpowered", "A novelty effect: existing users responded to the change itself rather than its value", "Sample ratio mismatch", "Seasonality"], a: 1, why: "Novelty decay is the classic signature. It is why tests on existing users often need longer runs than new-user tests." },
          { lvl: 3, q: "Your primary metric is flat but three of twelve secondary metrics are significant. The correct interpretation is:", opts: ["The change works on secondary outcomes", "With twelve comparisons, some significance is expected by chance; treat these as hypotheses for a new test", "The primary metric is mismeasured", "Ship based on the secondaries"], a: 1, why: "Multiple comparisons inflate false positives. Unplanned secondary wins generate hypotheses, not conclusions." },
          { lvl: 4, q: "Users in the treatment can see and discuss the change with control users in a shared workspace. This threatens:", opts: ["Statistical power", "Independence between arms, since the control is partly exposed to the treatment", "Sample ratio", "Metric definition"], a: 1, why: "Interference between arms biases the comparison toward null and often requires cluster-level randomization instead." },
          { lvl: 4, q: "A test is significant and above your MDE, but only for one large customer's users. Before shipping you should:", opts: ["Ship, the result is significant", "Check whether the effect holds with that customer excluded, since one account can dominate the result", "Increase the sample", "Re-run with a different metric"], a: 1, why: "Concentration in one account means you measured that account, not the population, and the effect may not generalize." },
          { lvl: 5, q: "Leadership wants a decision on day 5 of a planned 14-day test. The most defensible response is:", opts: ["Provide the interim numbers with a caveat", "Explain that interim reads are not interpretable, restate the scheduled read date, and offer guardrail status only", "End the test early", "Extend the test"], a: 1, why: "Interim numbers with a caveat still get acted on. Guardrail status answers the real underlying worry without licensing a false conclusion." },
          { lvl: 5, q: "Your team has run 30 experiments this year and shipped 26. The most likely problem is:", opts: ["The team is highly effective", "The bar for shipping is too low or the tests are not testing risky assumptions, since a healthy program fails often", "Not enough experiments", "Tests run too long"], a: 1, why: "A high win rate usually means the program tests safe changes or reads results generously. Learning comes disproportionately from losses." }
        ],
        project: {
          title: "Design and read an experiment",
          brief: "Take a real product change. Write the hypothesis with mechanism and MDE, compute the required sample and duration, list your guardrails, and write the readout template you would fill in, including what result would make you not ship."
        }
      }
    ]
  }
];
