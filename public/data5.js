/* Answer checking for practice exercises.

   Queries are checked structurally, not executed: the browser has no database, so
   the check looks for the things that have to be true of a correct answer and the
   mistakes that make one wrong. Written exercises are checked for concept coverage,
   which says whether an idea was raised, not whether it was argued well. Both are
   labelled honestly in the UI. */

(function () {
  var C = {

    /* ---------------- SQL ---------------- */

    "sql-pm": [
      { must: [
          ["Counts distinct users rather than rows", /count\s*\(\s*distinct/],
          ["Includes the view_cart step", /view_cart/],
          ["Includes the begin_checkout step", /begin_checkout/],
          ["Includes the purchase step", /purchase/],
          ["Filters on the event date window", /where[\s\S]*event_date/]
        ],
        forbid: [["Uses COUNT(*), which counts rows and inflates every step", /count\s*\(\s*\*\s*\)/]] },
      { must: [
          ["Starts from the assignment table", /experiment_assignments/],
          ["Keeps users who never converted (LEFT JOIN)", /left\s+(outer\s+)?join/],
          ["Splits the result by variant", /group\s+by\s+[a-z_.]*variant/],
          ["Counts only conversions after assignment", /converted_at\s*>=?\s*[a-z_.]*assigned_at/],
          ["Restricts to the checkout_v3 experiment", /checkout_v3/]
        ],
        forbid: [["Uses an inner join, which silently drops non-converters", /(^|[^t]\s)inner\s+join/]] }
    ],

    "sql-ba": [
      { must: [
          ["Aggregates line items to one row per order first", /group\s+by\s+[a-z_.]*order_id/],
          ["Keeps orders that have no line items", /left\s+(outer\s+)?join/],
          ["Shows a missing total as zero", /coalesce|ifnull|nvl\s*\(/],
          ["Excludes cancelled orders", /status\s*(<>|!=)\s*'cancelled'|status\s+not\s+in/],
          ["Filters to the September window", /order_date/]
        ] },
      { must: [
          ["Keeps rows where region is null", /is\s+distinct\s+from|region\s+is\s+null/],
          ["Excludes internal accounts", /is_internal/],
          ["Treats an unset internal flag as external", /coalesce\s*\(\s*is_internal|is_internal\s+is\s+null/],
          ["Restricts to active accounts", /status\s*=\s*'active'/]
        ] }
    ],



    /* ---------------- written answers: concept coverage ---------------- */

    "metrics-pm": [
      { points: [
          ["Names a problem with listings as a measure of value", /quality|spam|duplicate|inflat|gam|does not|doesn't|supply/],
          ["Proposes an outcome that needs both supply and demand", /transaction|gmv|booking|match|sale|purchase|both sides/],
          ["Keeps listings as an input or guardrail rather than discarding it", /input|guardrail|tree|secondary|still/]
        ] },
      { points: [
          ["Identifies the mix shift between segments", /mix|weight|shift|composition|proportion/],
          ["Names it as Simpson's paradox or the same effect", /simpson|paradox|aggregate/],
          ["Says what should be reported, not just what happened", /report|tell|leadership|both segments|surface/]
        ] }
    ],
    "discovery-pm": [
      { points: [
          ["Converts the hypothetical into a specific past event", /last time|recent|walk me|tell me about/],
          ["Asks what they do today", /today|currently|now|workaround|instead/],
          ["Probes the cost of the current approach", /how long|cost|time|frustrat|effort|often/]
        ] },
      { points: [
          ["Weighs three unprompted mentions as real but weak", /weak|signal|not enough|small|three|unprompted/],
          ["Connects it to a job or outcome rather than a preference", /job|outcome|preference|blocked|value/],
          ["Decides what to do with it rather than just judging it", /log|track|next round|backlog|revisit|deprioriti/]
        ] }
    ],
    "prioritization-pm": [
      { points: [
          ["Treats the gap as a scope disagreement, not a speed one", /scope|different|assum|include|edge case/],
          ["Gets both engineers to state what is in scope", /both|ask|align|clarif|discuss/],
          ["Notes that a surviving gap is a risk signal worth surfacing", /risk|uncertain|surface|team|estimate again/]
        ] },
      { points: [
          ["Separates deal risk from product value", /deal|revenue|business|separate|value/],
          ["Tests whether the feature is a genuine blocker", /blocker|really|workaround|manual|contract|commit/],
          ["Says an override must be declared rather than hidden in the score", /override|transparen|say|inflat|honest|explicit/]
        ] }
    ],
    "prd-pm": [
      { points: [
          ["States who is blocked and how often", /admin|enterprise|deal|team|how often|per/],
          ["Quantifies the cost of doing nothing", /lost|block|cost|deal|risk|manual|hours/],
          ["Leaves room for more than one solution", /saml|scim|sync|option|approach|alternativ/]
        ] },
      { points: [
          ["Covers a size or validation failure", /size|limit|too large|invalid|format/],
          ["Covers an interrupted or failed transfer", /network|interrupt|resume|retry|fail|connection/],
          ["Covers a permission or access failure", /permission|access|denied|unauthor|role/]
        ] }
    ],
    "experimentation-pm": [
      { points: [
          ["Refuses to stop early", /no|don't|do not|wait|run to|continue|keep/],
          ["Names peeking or the inflated false positive rate", /peek|false positive|multiple|repeated|alpha/],
          ["Allows a guardrail breach as the one reason to stop", /guardrail|harm|breach|only reason|except/]
        ] },
      { points: [
          ["Separates significance from practical value", /practical|significan|meaningful|worth|material/],
          ["Compares against the pre-committed minimum effect", /mde|minimum|threshold|committed|before/],
          ["Prices the ongoing cost of the change", /maintenance|complexity|code path|cost|permanent/]
        ] }
    ],
    "requirements-ba": [
      { points: [
          ["Asks what decision the report supports", /decision|why|use|purpose|act/],
          ["Asks what they do today to get the information", /today|current|now|workaround|manual/],
          ["Considers self-service instead of more columns", /filter|self|drill|subset|first|explore/]
        ] },
      { points: [
          ["Writes a story with a role and an outcome", /as a|so that|in order to/],
          ["Gives a criterion above the threshold", /above|over|5,?001|greater|exceed/],
          ["Gives a criterion at the boundary", /exactly|equal|at the threshold|5,?000/]
        ] }
    ],
    "process-ba": [
      { points: [
          ["Places the time in waiting rather than in the work", /wait|queue|idle|between|elapsed/],
          ["Names batching or an untriggered handoff", /batch|weekly|trigger|inbox|notif|arriv/],
          ["Targets the handoffs rather than the task speed", /handoff|trigger|complete|upfront|first time/]
        ] },
      { points: [
          ["Recommends removing rather than automating", /remove|eliminat|delete|drop|not automat/],
          ["Asks what risk the control was meant to catch", /risk|control|why|purpose|intend/],
          ["Proposes a threshold or sampled replacement", /threshold|sampl|spot|exception|above/]
        ] }
    ],
    "excel-ba": [
      { must: [
          ["Forces an exact match", /xlookup|,\s*false\s*\)|,\s*0\s*\)/],
          ["Makes a missing key visible instead of silently filling it", /ifna|iferror/],
          ["Names the lookup column or range being searched", /source|\$?[a-z]\s*:\s*\$?[a-z]|table|range|a2|a:a/]
        ] },
      { points: [
          ["Adds a permanent reconciliation check", /check|reconcil|difference|flag|tie/],
          ["Uses a tolerance rather than exact zero", /toleran|rounding|abs|small/],
          ["Names a likely cause such as a missed range or double count", /range|missing|hardcod|double|overlap|omitted/]
        ] }
    ],
    "stakeholder-ba": [
      { points: [
          ["Classifies them as high influence, low interest", /high influence|low interest|influence|engage late/],
          ["Switches to a short written cadence", /written|email|update|brief|short|cadence/],
          ["Asks explicitly for decisions with a date", /decision|need|by|date|deadline|ask/]
        ] },
      { points: [
          ["Leads with the trade in the CFO's own unit", /cash|margin|working capital|payback|cost|roi/],
          ["Quantifies both the cost and the benefit", /fte|headcount|annual|salary|saving|benefit|\d/],
          ["Puts the recommendation first, detail later", /recommend|first|lead|appendix|below/]
        ] }
    ],
  };

  var idx = {};
  window.CP_ROLES.forEach(function (r) { r.skills.forEach(function (s) { idx[s.id] = s; }); });

  function pack(list) {
    return (list || []).map(function (p) { return { label: p[0], re: p[1] }; });
  }

  Object.keys(C).forEach(function (skillId) {
    var s = idx[skillId];
    if (!s) return;
    C[skillId].forEach(function (spec, i) {
      if (!spec || !s.practice[i]) return;
      s.practice[i].check = {
        must: pack(spec.must),
        forbid: pack(spec.forbid),
        points: pack(spec.points)
      };
    });
  });
})();
