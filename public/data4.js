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

    "sql-da": [
      {
        kind: "query",
        prompt: "Produce daily revenue with a 7-day moving average, covering every calendar day in the range even on days with no orders.",
        schema: "orders                        calendar\n  order_id   BIGINT             day  DATE\n  order_date DATE\n  amount     NUMERIC",
        hints: [
          "Aggregate to one row per day before applying any window, or the window frames over order rows instead of days.",
          "An ORDER BY with no explicit frame gives you a running average from the start of the series, not a 7-day one.",
          "Days with no orders have no row to sit on, so the spine has to come from the calendar table."
        ],
        solution: "WITH daily AS (\n  SELECT c.day,\n         COALESCE(SUM(o.amount), 0) AS revenue\n  FROM calendar c\n  LEFT JOIN orders o ON o.order_date = c.day\n  WHERE c.day BETWEEN DATE '2026-01-01' AND DATE '2026-09-30'\n  GROUP BY c.day\n)\nSELECT\n  day,\n  revenue,\n  AVG(revenue) OVER (\n    ORDER BY day\n    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW\n  ) AS ma_7d\nFROM daily\nORDER BY day;",
        answer: "The explicit ROWS BETWEEN 6 PRECEDING AND CURRENT ROW is what makes this a 7-day average. Omit the frame and the implicit default is RANGE UNBOUNDED PRECEDING, which gives a running average over the whole series and looks plausible enough that the mistake often ships.\n\nThe calendar spine matters for the same reason. Without it, ROWS counts the last 7 rows present, so a week containing three zero-order days averages over 7 rows spanning ten calendar days. The first six rows are also averaging over fewer than seven days, which you either accept or filter out at the edge."
      },
      {
        kind: "query",
        prompt: "Return the top 3 products by revenue within each category.",
        schema: "sales\n  product   TEXT\n  category  TEXT\n  revenue   NUMERIC",
        hints: [
          "LIMIT 3 applies to the whole result set, not to each category.",
          "You need a ranking that restarts for every category, which is what PARTITION BY does.",
          "A window function cannot be filtered in the same SELECT's WHERE clause, so the rank has to be computed one level down."
        ],
        solution: "WITH ranked AS (\n  SELECT\n    category,\n    product,\n    revenue,\n    ROW_NUMBER() OVER (\n      PARTITION BY category\n      ORDER BY revenue DESC\n    ) AS rn\n  FROM sales\n)\nSELECT category, product, revenue\nFROM ranked\nWHERE rn <= 3\nORDER BY category, rn;",
        answer: "This is the top-N-per-group pattern and it comes up constantly. PARTITION BY restarts the numbering for each category; ORDER BY inside the window decides what \"top\" means.\n\nThe choice of ranking function matters when revenue ties. ROW_NUMBER picks an arbitrary winner among tied rows and always returns exactly three. RANK returns more than three if there is a tie at the boundary and leaves gaps afterwards. DENSE_RANK also returns more than three but without gaps. Pick deliberately rather than by habit, and if you have a tiebreaker the business cares about, add it to the ORDER BY."
      }
    ],

    "sql-fa": [
      {
        kind: "query",
        prompt: "Build a P&L summary for accounting period 9: revenue and operating expense by account, for the trading entities only, with revenue presented as a positive number.",
        schema: "gl_lines\n  entry_id     BIGINT\n  account_code TEXT\n  account_type TEXT     -- 'revenue', 'expense', 'asset', 'liability', 'equity'\n  period       INT      -- accounting period, 1-12 (13 = adjusting)\n  entity_id    TEXT\n  txn_date     DATE\n  amount       NUMERIC  -- credits stored negative",
        hints: [
          "Filter on period, not on txn_date. An entry dated 2 October can belong to period 9.",
          "Revenue is a credit and is stored negative, so a plain SUM returns a negative revenue figure that is correct but unpresentable.",
          "Intercompany entities must come out or the consolidated figures double count."
        ],
        solution: "SELECT\n  account_code,\n  account_type,\n  CASE WHEN account_type = 'revenue'\n       THEN -SUM(amount)\n       ELSE  SUM(amount)\n  END AS reported_amount\nFROM gl_lines\nWHERE period = 9\n  AND account_type IN ('revenue', 'expense')\n  AND entity_id NOT IN ('ELIM', 'IC01')\nGROUP BY account_code, account_type\nORDER BY account_type, account_code;",
        answer: "The sign flip belongs in one place, applied by account type, rather than scattered through the query. Flipping inconsistently across accounts is how a P&L ends up internally contradictory.\n\nPeriod filtering is the single most common reason a finance query disagrees with the reported numbers. Note also that period 13, the adjusting period, is excluded here by the period = 9 filter, which is right for a monthly view and wrong for a full-year roll-up: a year-to-date query that forgets period 13 misses the audit adjustments entirely.\n\nHardcoding the elimination entity list is a known weakness. In production that belongs in a reference table, because a new intercompany entity added next quarter would silently break this query with nothing to announce it."
      },
      {
        kind: "query",
        prompt: "Write the tie-out check: for each period, the difference between the GL total and the trial balance total, flagged when it exceeds a rounding tolerance.",
        schema: "gl_lines                      trial_balance\n  period  INT                   period  INT\n  amount  NUMERIC               total   NUMERIC",
        hints: [
          "Both sides have to be brought to the same grain before they can be compared.",
          "A period present in one source and missing from the other is exactly the failure you are trying to catch, so an inner join would hide it.",
          "Floating point and rounding mean you compare against a small tolerance, not against zero."
        ],
        solution: "WITH gl AS (\n  SELECT period, SUM(amount) AS gl_total\n  FROM gl_lines\n  GROUP BY period\n)\nSELECT\n  COALESCE(gl.period, tb.period)                       AS period,\n  COALESCE(gl.gl_total, 0)                             AS gl_total,\n  COALESCE(tb.total, 0)                                AS tb_total,\n  COALESCE(gl.gl_total, 0) - COALESCE(tb.total, 0)     AS difference,\n  CASE WHEN ABS(COALESCE(gl.gl_total, 0) - COALESCE(tb.total, 0)) > 0.01\n       THEN 'FAIL' ELSE 'OK' END                       AS tie_out\nFROM gl\nFULL OUTER JOIN trial_balance tb ON tb.period = gl.period\nORDER BY period;",
        answer: "The FULL OUTER JOIN is the point. An inner join would quietly drop a period that exists in the GL but not the trial balance, which is precisely the discrepancy worth catching, and the check would report clean.\n\nA tolerance rather than = 0 keeps the check from failing on rounding noise. Set it to the materiality the business actually uses rather than picking a number.\n\nThis is the kind of query that should run automatically alongside the report, not as something a person remembers to check. A tie-out that runs every time catches drift the moment it appears; a quarterly manual review finds it after decisions have already been made on the wrong numbers."
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
    "stats-da": [
      { hints: ["A mean roughly three times the median is a strong signal about the shape of the distribution.",
                "Check whether the tail is one kind of customer, because that is a segmentation question, not a statistics one."] },
      { hints: ["You selected the group precisely because it was extreme.",
                "Extreme values are partly noise, and noise does not repeat."] }
    ],
    "viz-da": [
      { hints: ["Any correlation the reader sees on a dual axis is a product of two arbitrary scale choices.",
                "Two charts sharing an x-axis show the same timing relationship without asserting a relationship."] },
      { hints: ["Start from the decisions it should support, not from the tiles already on it.",
                "A dashboard's value is mostly in what it leaves out."] }
    ],
    "python-da": [
      { hints: ["Row counts only grow like that when the merge key repeats on both sides.",
                "pandas will tell you before it corrupts the data, if you ask it to validate the relationship."] },
      { hints: ["Try restart-and-run-all first: if the result changes on a clean run, it is state or a seed.",
                "If only the comparison to last week changed, look at the data source and the library versions."] }
    ],
    "cleaning-da": [
      { hints: ["How much is missing matters far less than why.",
                "Compare the rows with and without income across everything else you have."] },
      { hints: ["Check the identity key before celebrating: too loose a key merges genuinely different records.",
                "If the key is right, 30% duplication is an upstream problem worth more than the cleaning step."] }
    ],
    "modeling-fa": [
      { hints: ["When the imbalance equals one line item exactly, that line is missing its counterpart.",
                "Every cash flow movement needs a mirror on the balance sheet."] },
      { hints: ["Revenue is recognised when earned, not when collected.",
                "Ask where the cash physically is if the sale has been booked but not paid."] }
    ],
    "valuation-fa": [
      { hints: ["The cross-check just caught something. Work backwards from the implied multiple.",
                "Solve for the terminal growth rate that lands inside the comparable range, then judge whether that rate is defensible."] },
      { hints: ["Raw beta carries two things: business risk and that company's own leverage.",
                "You want the first without the second, then relevered at your subject's capital structure."] }
    ],
    "excel-fa": [
      { hints: ["Trace precedents on the line that is not moving.",
                "Set every downside input to an absurd value and see which outputs fail to react."] },
      { hints: ["Data tables recalculate their whole grid on every workbook change.",
                "There is a calculation setting that leaves normal formulas live and refreshes tables on demand."] }
    ],
    "variance-fa": [
      { hints: ["Volume on plan removes one of the three explanations immediately.",
                "If it is mix rather than price, the cause is usually how quota and commission are structured."] },
      { hints: ["Variable costs should fall when volume falls, so some of that favourability is arithmetic.",
                "Rebuild the comparison at actual volume before drawing any conclusion."] }
    ]
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
