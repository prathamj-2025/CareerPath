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

    "sql-da": [
      { must: [
          ["Aggregates to one row per day before the window", /group\s+by\s+[a-z_.]*(day|order_date)/],
          ["Uses an explicit 7-row frame", /rows\s+between\s+6\s+preceding\s+and\s+current\s+row/],
          ["Averages over a window", /avg\s*\([\s\S]*?\)\s*over/],
          ["Covers days with no orders", /calendar|left\s+(outer\s+)?join/]
        ] },
      { must: [
          ["Restarts the ranking for each category", /partition\s+by\s+[a-z_.]*category/],
          ["Uses a ranking function", /row_number|dense_rank|(^|[^_])rank\s*\(/],
          ["Ranks by revenue, highest first", /order\s+by\s+[a-z_.]*revenue\s+desc/],
          ["Filters to the top 3 outside the window", /<=\s*3|=\s*1\s+or|qualify/]
        ],
        forbid: [["Uses LIMIT 3, which truncates the whole result instead of each category", /limit\s+3/]] }
    ],

    "sql-fa": [
      { must: [
          ["Filters on accounting period, not transaction date", /period\s*(=|in)/],
          ["Flips the sign so revenue reads positive", /-\s*sum|sum\s*\(\s*-|\*\s*-\s*1/],
          ["Handles revenue and expense differently", /case\s+when[\s\S]*revenue/],
          ["Excludes intercompany entities", /entity_id\s+not\s+in|elim|ic01/]
        ],
        forbid: [["Filters on txn_date, which puts entries in the wrong period", /txn_date/]] },
      { must: [
          ["Brings the GL to period grain", /group\s+by\s+[a-z_.]*period/],
          ["Keeps a period missing from either side", /full\s+(outer\s+)?join/],
          ["Compares against a tolerance rather than zero", /abs\s*\(/],
          ["Flags the failing periods", /case\s+when/]
        ],
        forbid: [["Uses an inner join, which hides the very gap you are checking for", /(^|[^t]\s)inner\s+join/]] }
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
    "stats-da": [
      { points: [
          ["Identifies right skew from the mean and median gap", /skew|tail|outlier|right/],
          ["Reports both statistics rather than one", /both|median and mean|report both|alongside/],
          ["Suggests segmenting the large orders", /segment|split|bulk|enterprise|separate|group/]
        ] },
      { points: [
          ["Names regression to the mean", /regression to the mean|regress|revert|mean/],
          ["Explains that the group was selected for being extreme", /extreme|selected|worst|chose|noise/],
          ["Asks for a control or comparison group", /control|comparison|counterfactual|holdout|similar/]
        ] }
    ],
    "viz-da": [
      { points: [
          ["Rejects the dual axis and says why", /dual|two axes|arbitrar|scale|misleading|manufactur/],
          ["Offers aligned charts sharing an x-axis", /two charts|stack|aligned|separate|share|same x/],
          ["Mentions indexing as an alternative if one chart is required", /index|normali|base|100|rebase|percent change/]
        ] },
      { points: [
          ["Starts from the decisions it supports", /decision|question|purpose|what.*ask/],
          ["Keeps a small summary layer", /summary|headline|top|three|five|kpi/],
          ["Moves the rest to a detail view", /detail|drill|link|separate|secondary|remove/]
        ] }
    ],
    "python-da": [
      { points: [
          ["Identifies duplicate keys on both sides", /duplicate|both sides|many.to.many|repeat/],
          ["Uses a check such as duplicated() or validate", /duplicated|validate|value_counts|indicator|nunique/],
          ["Decides the correct grain before merging", /aggregate|grain|dedup|group|collapse|one row/]
        ] },
      { points: [
          ["Tests with a clean restart and run all", /restart|run all|clean|fresh|rerun/],
          ["Considers an unset random seed", /seed|random|sample/],
          ["Considers the data or library changing underneath", /version|depend|library|data chang|source|pin/]
        ] }
    ],
    "cleaning-da": [
      { points: [
          ["Diagnoses the mechanism before choosing a fix", /mechanism|why|mcar|mar|mnar|random|compare/],
          ["Compares rows with and without the value", /compare|with and without|differ|systematic|distribution/],
          ["Names income as a likely not-at-random case", /not at random|mnar|depends on the value|high earner|refus/]
        ] },
      { points: [
          ["Questions whether the identity key is too loose", /key|identity|too loose|match|over.?merg/],
          ["Treats 30% as an upstream pipeline signal", /upstream|pipeline|double.?write|retry|backfill|source/],
          ["Recommends monitoring the rate over time", /log|monitor|track|each run|rate|alert/]
        ] }
    ],
    "modeling-fa": [
      { points: [
          ["Locates the missing mirror entry", /pp&e|ppe|balance sheet|mirror|counterpart|not added/],
          ["Connects the imbalance amount to the specific line", /equal|exactly|same amount|matches|capex/],
          ["States the general rule for cash flow items", /every|mirror|both|each cash flow|rule/]
        ] },
      { points: [
          ["Separates recognition from collection", /recogni|accrual|earned|collect|cash received/],
          ["Explains receivables as uncollected revenue", /receivable|uncollected|owed|not yet paid/],
          ["Notes the profitable-but-cash-poor failure", /cash|insolven|run out|working capital|growth/]
        ] }
    ],
    "valuation-fa": [
      { points: [
          ["Treats the gap as a signal that assumptions are too aggressive", /aggressive|too high|wrong|optimistic|assumption/],
          ["Names terminal growth, WACC or margins as the driver", /terminal|growth|wacc|discount|margin/],
          ["Solves backwards to a defensible range", /back|solve|imply|implied|reverse|range/]
        ] },
      { points: [
          ["Says raw beta contains the comparable's leverage", /leverage|debt|capital structure|its own|financial risk/],
          ["Separates business risk from financial risk", /business risk|asset|unlever|operat/],
          ["Relevers at the subject's own structure", /relever|subject|target|own capital|own structure/]
        ] }
    ],
    "excel-fa": [
      { points: [
          ["Traces precedents on the line that will not move", /trace|precedent|follow|audit|formula/],
          ["Looks for a driver bypassing the switch", /bypass|direct|hardcod|reference|not linked|choose|index/],
          ["Uses extreme inputs to find unresponsive outputs", /extreme|absurd|large|test|stress|sensitiv/]
        ] },
      { points: [
          ["Explains that data tables recalculate their whole grid", /grid|recalc|every|whole|entire|each change/],
          ["Names the automatic-except-data-tables setting", /automatic except|except data table|manual|calculation (mode|setting)/],
          ["Suggests reducing grid size or table count", /smaller|reduce|fewer|size|limit/]
        ] }
    ],
    "variance-fa": [
      { points: [
          ["Rules out volume as the cause", /volume (is )?on plan|not volume|rules? out|eliminat/],
          ["Separates price from mix", /price|mix|composition|realiz/],
          ["Links a mix problem to incentives", /quota|commission|incentive|comp|sales team|reward/]
        ] },
      { points: [
          ["Rejects the favourable variance as arithmetic", /not good|arithmetic|expected|because volume|misleading|no/],
          ["Rebuilds the comparison at actual volume", /flex|actual volume|restate|rebuild|adjust/],
          ["Identifies the worse case of rising unit costs", /per unit|unit cost|efficiency|worse|rose/]
        ] }
    ]
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
