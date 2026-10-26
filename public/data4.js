/* Practice exercise upgrade.
   Practice is now attempt-first: the learner writes an answer in place, can take
   progressive hints, and only then reveals the model answer. SQL skills get real
   query-writing tasks with a schema; judgement skills keep a written answer,
   because there is no query to write for stakeholder conflict or prioritisation. */

(function () {
  var PATCH = {

    /* ---------------- SQL, four different lenses ---------------- */

    "sql-pm": [
      {
        kind: "query",
        prompt: "Write the query behind the checkout funnel for the first two weeks of September: how many people viewed a cart, how many began checkout, and how many purchased.",
        schema: "events\n  user_id     BIGINT\n  event       TEXT     -- 'view_cart', 'begin_checkout', 'purchase'\n  event_date  DATE",
        hints: [
          "A funnel counts people, not rows. One person who viewed the cart four times is one user at that step.",
          "You want three numbers from one pass over the table, so put a CASE inside each aggregate rather than writing three separate queries.",
          "Every step has to be filtered to the same date window, or the steps are not comparable."
        ],
        solution: "SELECT\n  COUNT(DISTINCT CASE WHEN event = 'view_cart'      THEN user_id END) AS viewed_cart,\n  COUNT(DISTINCT CASE WHEN event = 'begin_checkout' THEN user_id END) AS began_checkout,\n  COUNT(DISTINCT CASE WHEN event = 'purchase'       THEN user_id END) AS purchased\nFROM events\nWHERE event_date BETWEEN DATE '2026-09-01' AND DATE '2026-09-14';",
        answer: "COUNT(DISTINCT user_id) is the whole point: COUNT(*) counts rows and inflates every step where users repeat an action. The CASE inside each aggregate gives you all three steps from one scan.\n\nThis version does not enforce ordering, so a user who purchased before viewing a cart still counts at both steps. That is usually fine for a directional read and it is worth saying out loud when you present the number. When ordering matters, you compare timestamps per user instead."
      },
      {
        kind: "query",
        prompt: "Write the readout query for the checkout_v3 experiment: per variant, how many users were assigned and how many converted. Only conversions that happened after assignment should count.",
        schema: "experiment_assignments          conversions\n  user_id     BIGINT            user_id      BIGINT\n  experiment  TEXT              converted_at TIMESTAMP\n  variant     TEXT\n  assigned_at TIMESTAMP",
        hints: [
          "Start from assignments, not conversions. The people who did not convert are the ones you are measuring against.",
          "An INNER JOIN would silently drop every non-converter and make both arms look perfect.",
          "Conversions that predate assignment are not caused by the treatment, so the join needs a timestamp condition."
        ],
        solution: "SELECT\n  a.variant,\n  COUNT(DISTINCT a.user_id) AS assigned,\n  COUNT(DISTINCT c.user_id) AS converted\nFROM experiment_assignments a\nLEFT JOIN conversions c\n  ON c.user_id = a.user_id\n AND c.converted_at > a.assigned_at\nWHERE a.experiment = 'checkout_v3'\nGROUP BY a.variant;",
        answer: "Three things make this correct rather than merely runnable. The LEFT JOIN keeps users who never converted, which an INNER JOIN would discard. The timestamp condition sits in the ON clause, not the WHERE clause, because putting it in WHERE would turn the outer join back into an inner one. And the denominator is users assigned, not users who reached some later step, since the treatment can change who reaches that step.\n\nBefore reading the result, check the split: if 50/50 assignment comes back meaningfully unbalanced on a large sample, assignment is broken and no metric below it means anything."
      }
    ],

    "sql-ba": [
      {
        kind: "query",
        prompt: "Finance needs September revenue per order. Write the query, excluding cancelled orders, and make sure an order with no line items still appears with zero rather than disappearing.",
        schema: "orders                        order_items\n  order_id    BIGINT            order_id   BIGINT\n  customer_id BIGINT            sku        TEXT\n  order_date  DATE              qty        INT\n  status      TEXT              unit_price NUMERIC",
        hints: [
          "Joining orders straight to order_items multiplies order rows by their line count. Any SUM over that result is wrong.",
          "Fix the grain before joining: collapse order_items to one row per order first.",
          "Keeping orders with no items means a LEFT JOIN, and a null total needs COALESCE to read as zero."
        ],
        solution: "WITH item_totals AS (\n  SELECT order_id, SUM(qty * unit_price) AS order_revenue\n  FROM order_items\n  GROUP BY order_id\n)\nSELECT\n  o.order_id,\n  o.order_date,\n  COALESCE(i.order_revenue, 0) AS revenue\nFROM orders o\nLEFT JOIN item_totals i ON i.order_id = o.order_id\nWHERE o.status <> 'cancelled'\n  AND o.order_date >= DATE '2026-09-01'\n  AND o.order_date <  DATE '2026-10-01';",
        answer: "Pre-aggregating in a CTE restores the grain you actually want, one row per order, so nothing fans out. SELECT DISTINCT would not have saved you here: it removes duplicate rows but the inflated SUM is already wrong.\n\nTwo details that decide whether this reconciles. The date range uses >= and < rather than BETWEEN, because BETWEEN on a timestamp column resolves the upper bound to midnight and silently drops the last day. And status <> 'cancelled' excludes rows where status is null, so if null means anything other than cancelled in your system, you need OR o.status IS NULL."
      },
      {
        kind: "query",
        prompt: "Count active accounts outside the West region, excluding internal test accounts. Region is nullable and the business wants unknown-region accounts included in the count.",
        schema: "accounts\n  account_id  BIGINT\n  email       TEXT\n  region      TEXT      -- nullable\n  status      TEXT\n  is_internal BOOLEAN   -- nullable",
        hints: [
          "region <> 'West' looks right and quietly drops every row where region is null, because comparing anything to null is unknown rather than true.",
          "The same trap applies to is_internal: a null there is not false.",
          "Write the exclusion so a reviewer can see the null handling was a decision, not an accident."
        ],
        solution: "SELECT COUNT(*) AS active_accounts\nFROM accounts\nWHERE status = 'active'\n  AND (region IS DISTINCT FROM 'West')     -- keeps NULL regions\n  AND COALESCE(is_internal, FALSE) = FALSE;",
        answer: "IS DISTINCT FROM is the null-safe inequality: it treats null as a value that differs from 'West' rather than returning unknown. If your database does not support it, (region <> 'West' OR region IS NULL) does the same job and is just as explicit.\n\nCOALESCE(is_internal, FALSE) makes the assumption visible: rows where the flag was never set are being treated as external. That is a business decision, and writing it this way means the next person can see it and challenge it instead of discovering it during a reconciliation."
      }
    ],



    /* ---------------- judgement skills: hints on written answers ---------------- */

    "metrics-pm": [
      { hints: ["Ask what the metric would do if it were gamed: what could a team do to move listings that does not help a single buyer?",
                "A north star should need both sides of a marketplace to succeed, not just supply."] },
      { hints: ["Both segments improved and the total fell, which only happens when the weighting between them changed.",
                "Name the effect, then treat the traffic shift itself as the question worth asking."] }
    ],
    "discovery-pm": [
      { hints: ["The question asks for a prediction about the future, which is the shape that invites politeness.",
                "Point it at a specific past occasion instead, and follow with what it cost them."] },
      { hints: ["Three unprompted mentions beats one, but ask what job the request is attached to.",
                "Compare it against patterns that block an outcome rather than express a preference."] }
    ],
    "prioritization-pm": [
      { hints: ["A four-times difference is almost never about typing speed.",
                "Ask each of them to say what is in scope before you touch the numbers."] },
      { hints: ["Separate the value of the feature from the value of the deal.",
                "Overriding the score is legitimate; quietly inflating an input to make the framework agree is not."] }
    ],
    "prd-pm": [
      { hints: ["Write it so that an engineer could propose something other than SSO and you could still judge it.",
                "Name who is blocked, how often, and what it has already cost."] },
      { hints: ["Take the success path you already have in your head and ask what breaks it.",
                "Size limits, interrupted connections, and missing permissions each need a stated behaviour."] }
    ],
    "experimentation-pm": [
      { hints: ["Ask what your false positive rate actually is once you have looked at the data four times.",
                "There is one reason to stop early, and it is not a good result."] },
      { hints: ["Statistical significance answers whether the effect is real, not whether it is worth having.",
                "Compare the lift against the minimum effect you committed to before launch, and price the permanent cost."] }
    ],
    "requirements-ba": [
      { hints: ["Forty columns is usually a workaround for slow request cycles, not a genuine need for forty columns.",
                "Ask what decision it supports and what they do today to get the information."] },
      { hints: ["The 'so that' clause is what lets a developer resolve a case you did not write down.",
                "Write one criterion at the threshold and one just above it, so the boundary is unambiguous."] }
    ],
    "process-ba": [
      { hints: ["Eleven days and four hours means the time is not in the work.",
                "Look at what each item waits for between steps, especially anything batched or untriggered."] },
      { hints: ["An approval that never rejects is not catching anything.",
                "Before removing it, find out what risk it was meant to cover and whether something else covers it."] }
    ],
    "excel-ba": [
      { kind: "formula",
        hints: ["A lookup that finds something for every row when you know keys are missing is not matching exactly.",
                "The fourth argument of VLOOKUP defaults to approximate match, which on unsorted data returns near-arbitrary values."],
        solution: "=IFNA(XLOOKUP($A2, Source!$A:$A, Source!$C:$C), \"NOT FOUND\")\n\n' VLOOKUP equivalent, if XLOOKUP is unavailable:\n=IFNA(VLOOKUP($A2, Source!$A:$C, 3, FALSE), \"NOT FOUND\")" },
      { hints: ["Add the check before you hunt for the cause, and keep it permanently.",
                "The usual culprits are a range that misses a segment, a hardcoded override, or an item counted in two segments."] }
    ],
    "stakeholder-ba": [
      { hints: ["High influence and low interest means they will re-engage at the worst possible moment.",
                "Stop relying on meeting attendance as the channel, since that is already not working."] },
      { hints: ["Translate into the unit the CFO owns: cash, margin, payback.",
                "Lead with the trade, not the process detail."] }
    ],
  };

  var idx = {};
  window.CP_ROLES.forEach(function (r) { r.skills.forEach(function (s) { idx[s.id] = s; }); });

  Object.keys(PATCH).forEach(function (skillId) {
    var s = idx[skillId];
    if (!s) return;
    PATCH[skillId].forEach(function (p, i) {
      var ex = s.practice[i];
      if (!ex) return;
      if (p.prompt) ex.prompt = p.prompt;
      if (p.answer) ex.answer = p.answer;
      ex.kind = p.kind || "written";
      ex.hints = p.hints || [];
      if (p.schema) ex.schema = p.schema;
      if (p.solution) ex.solution = p.solution;
    });
  });
})();
