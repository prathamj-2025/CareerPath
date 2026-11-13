/* Reference answers for the weekly challenges. They stay on the server (this folder is never served to browsers) and are
   shown only to the AI marker and to admins. An admin can write a different one for a challenge in the editor; that copy,
   saved in the database, replaces the one here. Each is ONE good answer, not the only one: the marker accepts other sound
   reasoning. Keyed by challenge id (cid). */
(function () {
  window.CP_CHALLENGE_REFS = {
    "pm-start":
      "I would build the better first-day tutorial. 60% of new users leave on day 1, which is by far the largest group of people " +
      "we are losing, and fixing it helps every future user, while dark mode (120 asks) and PDF export (45 asks) improve things for " +
      "people who already stayed. Dark mode and export are real requests but they can wait for a later sprint, because they do " +
      "not change whether a new user sticks around. After launch I would check day-1 retention (the share of new users who come back " +
      "the next day), and compare it with the 40% who stay today.",
    "ba-start":
      "SELECT product, SUM(quantity) AS total_sold FROM orders WHERE order_date >= date_trunc('month', current_date - interval '1 month') " +
      "AND order_date < date_trunc('month', current_date) GROUP BY product ORDER BY total_sold DESC LIMIT 3. " +
      "In words: keep only the orders from last month, add up the quantity for each product, sort the totals from highest to lowest, " +
      "and keep the first three. Any correct way to pick last month's dates, to total per product and to keep the top three counts.",
    "pjm-start":
      "Booking the platform and writing the slides do not depend on each other, so they can run at the same time. Invitations need " +
      "the platform first (1 + 2 = 3 days), and rehearsal needs the slides first (3 + 1 = 4 days). The longest chain is slides then " +
      "rehearsal, so the shortest time before the webinar is 4 days, and delaying the slides delays the webinar. One risk is that the " +
      "slides take longer than 3 days. I would handle it by starting them first, checking progress after day 1 and keeping a spare day " +
      "so rehearsal can still happen.",
    "pm-w1":
      "First I would split the 42% to 31% drop by cohort, platform, country and acquisition channel, to see whether it is one slice or " +
      "everywhere. If only one channel or platform dropped, that points to a change in who signs up or to a bug on that platform. " +
      "Second I would check whether the tracking itself broke, by looking at event counts and a logging change around the start of the " +
      "drop, because a data problem is cheaper to rule out than a product cause. If events are steady, a real change in behaviour is " +
      "likely. Third I would compare the acquisition mix over the six weeks, for example more paid or low-intent traffic, which can lower " +
      "retention with no product change. Each check rules something in or out, so I would go in that order: slice, data quality, mix, " +
      "and then look at product causes such as onboarding or notifications.",
    "pm-w2":
      "The primary metric is paid conversion within 30 days of signup, one number the test is judged on. Two guardrails protect against " +
      "known side effects: week-4 retention, because an earlier paywall can push people away, and refund or support-ticket rate, because " +
      "it can create angry customers. Before seeing data I would agree the rule: ship if conversion rises by at least 10% relative and " +
      "neither guardrail worsens by more than 2 points. I would still ship if week-4 retention falls a little, as long as revenue per " +
      "signup rises clearly, because that is a trade-off I accept knowingly, not a free win.",
    "ba-w1":
      "I would ask who the report is for and what decision it should help them make, what 'doing well' means for a branch (revenue, " +
      "orders, wait time, a target), what 'updated often' means (hourly, daily, weekly) and how fresh the data really is, and which " +
      "branches and time range matter. Then three testable requirements: 1) The report shows revenue, order count and target " +
      "attainment for each branch for the selected month. 2) The data refreshes every morning by 7:00 and shows the time of the last " +
      "refresh. 3) A regional manager can see only their own branches. Each one has a clear pass or fail a tester can check.",
    "ba-w2":
      "I would map the as-is process with the people who do the work, as a swimlane with one lane per team and a named owner for each step. " +
      "Then I would measure instead of guess: pull timestamps from the request system to get the time spent on each step and the time the " +
      "request waits between steps. I expect most of the eleven days to be waiting in queues and hand-offs, not work time. Once I see " +
      "where the largest wait is, I would propose a to-be change aimed at that step, such as approving in parallel or removing an " +
      "approval for low-value orders, and measure again.",
    "pjm-w1":
      "Paths: A-B-D-F is 3+4+5+2 = 14 days. A-C-E-F is 3+2+3+2 = 10 days. So the critical path is A, B, D, F and the project takes " +
      "14 days. Activity E sits on the shorter path, so it has 4 days of float and can slip up to 4 days without delaying the finish. " +
      "Any delay to A, B, D or F has no float to absorb it and delays the whole project day for day. I would watch the critical " +
      "activities most closely, especially D, the longest, and keep an eye on E so its float does not run out.",
    "pjm-w2":
      "SPI = earned value / planned value = 80,000 / 100,000 = 0.8, and CPI = earned value / actual cost = 80,000 / 95,000 = about 0.84. " +
      "In plain English: we have done 80 cents of work for every dollar we planned to have done, so we are behind schedule, and each " +
      "dollar spent has produced about 84 cents of value, so we are over budget. If this continues the project will finish late and cost " +
      "more than planned, roughly the budget divided by 0.84. I recommend we recover with options: reduce scope, add resources or " +
      "re-baseline. I would ask the sponsor to choose and approve one this week."
  };
})();
