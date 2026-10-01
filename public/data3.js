/* Financial Analyst track. SQL appears here a fourth time, with a finance lens. */

window.CP_ROLES.push({
  id: "fa",
  name: "Financial Analyst",
  tagline: "Build the model, defend every assumption in it.",
  skills: [
    {
      id: "modeling-fa",
      name: "Three-Statement Modeling",
      lens: "Linking IS, BS, CF; circularity; drivers",
      summary: "The three statements are one system. This track covers building the links correctly, making the balance sheet balance, and driving the model off assumptions rather than hardcoded numbers.",
      lessons: [
        {
          title: "How the three statements link",
          body: "Net income flows from the income statement to the top of the cash flow statement and into retained earnings on the balance sheet. That is the primary link, and getting it right is most of the structure.\n\nThe cash flow statement then reverses non-cash charges, principally depreciation and amortization, and adjusts for changes in working capital. An increase in accounts receivable is a use of cash, because you booked revenue you have not collected. An increase in accounts payable is a source, because you recorded an expense you have not paid.\n\nEnding cash from the cash flow statement becomes the cash line on the balance sheet. Depreciation reduces net PP&E; capital expenditure increases it. Debt issuance and repayment flow through financing activities to the debt balance. When every one of these links is live rather than hardcoded, the model balances on its own, and when it does not balance, the break is always in one of them."
        },
        {
          title: "Drivers, not hardcoded numbers",
          body: "A model whose revenue line is a typed number for each year is a spreadsheet, not a model. It cannot answer a question, because nothing responds to a change in assumptions.\n\nDrive each line off something economically meaningful. Revenue as units times price, or as customers times average revenue per customer. Cost of goods as a percentage of revenue or as a unit cost. Operating expenses split into what scales with revenue and what is fixed. Working capital as days sales outstanding, days inventory, and days payable, which converts balance sheet lines into operating assumptions a manager can discuss.\n\nThe test: can you answer 'what if churn rises 2 points' by changing one cell? If not, the driver structure is not there yet. All assumptions belong in one clearly marked input block, referenced everywhere else."
        },
        {
          title: "Circularity and the balance check",
          body: "Interest expense depends on the debt balance, the debt balance depends on the cash flow, the cash flow depends on net income, and net income depends on interest expense. That is a genuine circular reference, and it is inherent to the economics rather than a modeling mistake.\n\nTwo ways to handle it. Enable iterative calculation, which lets the engine converge, at the cost of a model that can produce unstable or stale values if something breaks. Or use average beginning and ending balances with a circuit breaker switch that forces interest to zero to reset the model when it goes unstable. Most banks use the second because it is auditable.\n\nThe balance check is non-negotiable: assets minus liabilities minus equity, displayed prominently, with conditional formatting that makes a non-zero value impossible to miss. When it breaks, the cause is nearly always a cash flow item that was not mirrored on the balance sheet, or a sign error on a cash outflow."
        }
      ],
      practice: [
        {
          prompt: "Your balance sheet is out by exactly the amount of this year's capex. Where is the error?",
          answer: "Capex was recorded in the cash flow statement as an investing outflow but not added to the PP&E balance on the balance sheet, or vice versa. Every cash flow item needs a mirror on the balance sheet. When the imbalance equals a specific line item exactly, that line is the one missing its counterpart, which is why a balance check that shows the amount rather than just a flag is so useful for debugging."
        },
        {
          prompt: "Explain why an increase in accounts receivable reduces cash flow despite rising revenue.",
          answer: "Revenue is recognized when earned, not when collected. An increase in receivables means a larger share of that recognized revenue has not been collected in cash, so the cash flow statement subtracts the increase to convert accrual net income back to cash. A company can grow revenue strongly and still run out of cash if receivables grow faster than collections, which is the classic profitable-but-insolvent failure."
        }
      ],
      quiz: [
        { q: "Net income flows to the balance sheet through:", opts: ["Cash", "Retained earnings", "Accounts payable", "Goodwill"], a: 1, why: "Retained earnings accumulate net income less dividends, which is the income statement's link to equity." },
        { q: "An increase in accounts payable is:", opts: ["A use of cash", "A source of cash", "Cash neutral", "An investing activity"], a: 1, why: "Delaying payment on a recorded expense retains cash in the business." },
        { q: "Interest expense creating circularity in a model is:", opts: ["A modeling error to eliminate", "Inherent to the economics and handled with iteration or a circuit breaker", "Caused by incorrect links", "Avoided by hardcoding debt"], a: 1, why: "The circularity is real: interest depends on debt, which depends on cash flow, which depends on interest." }
      ],
      assessment: [
        { lvl: 1, q: "Depreciation is added back on the cash flow statement because:", opts: ["It is not a real expense", "It is a non-cash charge that reduced net income without using cash", "It increases assets", "It is tax deductible"], a: 1, why: "The cash flow statement converts accrual income to cash by reversing non-cash items." },
        { lvl: 1, q: "The balance sheet equation is:", opts: ["Assets = Revenue - Expenses", "Assets = Liabilities + Equity", "Assets = Cash + Debt", "Assets = Equity - Liabilities"], a: 1, why: "Everything the company owns is financed by either creditors or owners." },
        { lvl: 2, q: "Capital expenditure appears on the cash flow statement under:", opts: ["Operating activities", "Investing activities", "Financing activities", "It does not appear"], a: 1, why: "Purchases of long-lived assets are investing activities." },
        { lvl: 2, q: "Revenue modeled as units times price rather than a typed growth rate is better because:", opts: ["It is more accurate", "It makes the drivers explicit and testable, so scenarios can be run on the underlying economics", "It is standard practice", "It is faster to build"], a: 1, why: "Driver-based lines let you answer what-if questions; typed growth rates cannot be interrogated." },
        { lvl: 3, q: "Your model balances in year 1 but breaks from year 2 onward. The most likely cause is:", opts: ["A formula error in year 1", "A link that is hardcoded in year 1 and not carried forward, or a prior-period balance not rolling correctly", "Circular reference", "Incorrect tax rate"], a: 1, why: "A break appearing in the first forecast year points to roll-forward logic rather than the structure itself." },
        { lvl: 3, q: "Days sales outstanding is used to model:", opts: ["Revenue growth", "Accounts receivable as a function of revenue", "Inventory turnover", "Debt repayment"], a: 1, why: "DSO converts receivables into an operating assumption tied to revenue." },
        { lvl: 4, q: "A company shows rising net income and falling cash. The most likely driver is:", opts: ["Higher depreciation", "Working capital consuming cash, typically receivables or inventory growing faster than payables", "Debt repayment", "Lower tax rate"], a: 1, why: "This is the standard profitable-but-cash-poor pattern, and working capital is where it shows up." },
        { lvl: 4, q: "A circuit breaker in a model with circular interest exists to:", opts: ["Speed up calculation", "Force interest to zero to break the loop and reset the model when iteration becomes unstable", "Prevent overwriting", "Cap the debt balance"], a: 1, why: "It is the auditable alternative to relying purely on iterative calculation." },
        { lvl: 5, q: "You inherit a model whose balance check has been manually overridden with a plug. The correct action is:", opts: ["Leave it if outputs look reasonable", "Trace and fix the underlying break, since a plug means an unknown error is flowing through every output", "Increase the tolerance", "Rebuild from scratch"], a: 1, why: "A plug conceals an error of unknown size and sign, which makes every derived number unreliable." },
        { lvl: 5, q: "For a model that will be handed to a deal team, the most important structural property is:", opts: ["Visual formatting", "That every assumption is isolated, labeled, and traceable, so any output can be tied back to a stated input", "Minimal tab count", "Fast calculation"], a: 1, why: "Models get challenged assumption by assumption; traceability is what lets them survive that scrutiny." }
      ],
      project: {
        title: "Build a linked three-statement model",
        brief: "Build a five-year model from a real company's filings with a separated input block, working capital driven by DSO/DIO/DPO, a live balance check, and a scenario toggle for at least three cases."
      }
    },
    {
      id: "valuation-fa",
      name: "Valuation: DCF & Comps",
      lens: "Free cash flow, WACC, terminal value, multiples",
      summary: "Valuation is a structured argument about the future. This track covers building a DCF whose assumptions you can defend, and using comparables without fooling yourself.",
      lessons: [
        {
          title: "Free cash flow and the discount rate",
          body: "Unlevered free cash flow is what the business generates before financing decisions: EBIT, less taxes on EBIT, plus depreciation and amortization, less capital expenditure, less the increase in net working capital. It is unlevered because it is available to all capital providers, which is why it is discounted at the weighted average cost of capital.\n\nWACC weights the cost of equity and the after-tax cost of debt by their market-value shares. The cost of equity usually comes from CAPM: risk-free rate plus beta times the equity risk premium. Beta should be unlevered from comparable companies and relevered at the target's capital structure, because a comparable's raw beta reflects its own leverage, not your subject's.\n\nThe discipline: small changes in WACC move the valuation enormously. A DCF presented as a single number rather than a range implies a precision the method cannot deliver."
        },
        {
          title: "Terminal value dominates, so treat it carefully",
          body: "In a typical five-year DCF, terminal value is 60% to 80% of the total. The forecast years you spent most of your time on are the minority of the answer, which is uncomfortable but true.\n\nTwo methods. Perpetuity growth applies a constant growth rate forever: TV = FCF in the final year times one plus g, divided by WACC minus g. The growth rate must be below long-run nominal GDP growth, because a company growing faster than the economy forever eventually becomes the economy. Rates above 3% deserve an explicit defense.\n\nExit multiple applies a comparable-company multiple to the final-year EBITDA. It is grounded in observable market data but imports whatever conditions prevail today into perpetuity.\n\nBest practice is to use both and cross-check. If perpetuity growth implies an exit multiple far outside the comparable range, one of your assumptions is wrong, and finding out which is the actual analysis."
        },
        {
          title: "Comparables without self-deception",
          body: "Comparable company analysis values a business against what the market pays for similar ones. Its strength is that it reflects real prices; its weakness is that it inherits whatever the market is doing, including mispricing.\n\nSelection is the whole game. Comparables must be genuinely similar in business model, growth, margin, and capital intensity, not merely in industry label. A high-growth software company and a mature one share a sector and almost nothing else that determines a multiple.\n\nUse the right multiple for the question. EV/EBITDA is capital-structure neutral, which is why it dominates for comparing companies with different leverage. P/E is affected by leverage and tax, making cross-company comparison harder. EV/Revenue is for companies without meaningful earnings, and it carries an implicit margin assumption that should be made explicit.\n\nAnd always report the range and the median rather than a single derived value. The spread is information about how much disagreement exists in the market, and hiding it overstates confidence."
        }
      ],
      practice: [
        {
          prompt: "Your DCF implies an exit multiple of 22x EBITDA. Comparables trade at 9-12x. What do you conclude?",
          answer: "Your assumptions are too aggressive somewhere, and the cross-check just caught it. The likely candidates are a terminal growth rate that is too high, a WACC that is too low, or forecast margins that expand beyond what the comparable set achieves. Work backward: solve for the terminal growth rate that produces a multiple inside the comparable range, then judge whether that rate is defensible. Presenting a 22x implied exit without addressing the gap would not survive a first review."
        },
        {
          prompt: "Why unlever and relever beta rather than using a comparable's raw beta?",
          answer: "Raw beta reflects both business risk and that specific company's financial leverage. Unlevering strips out the capital structure effect to isolate asset risk, and relevering applies your subject's actual capital structure. Skipping this imports the comparable's debt profile into your cost of equity, which produces a systematically wrong discount rate whenever leverage differs between the two."
        }
      ],
      quiz: [
        { q: "Unlevered free cash flow is discounted at:", opts: ["Cost of equity", "WACC", "Risk-free rate", "Cost of debt"], a: 1, why: "Unlevered cash flow belongs to all capital providers, so the blended cost of capital applies." },
        { q: "A terminal growth rate of 5% in a DCF is usually indefensible because:", opts: ["It is too low", "It implies the company eventually grows faster than the economy forever", "It requires more forecast years", "It conflicts with CAPM"], a: 1, why: "Perpetual growth above long-run nominal GDP is mathematically untenable." },
        { q: "EV/EBITDA is preferred over P/E for cross-company comparison because:", opts: ["It is simpler", "It is neutral to capital structure", "EBITDA is more accurate", "It includes growth"], a: 1, why: "Enterprise value and EBITDA are both pre-financing, so leverage differences do not distort the comparison." }
      ],
      assessment: [
        { lvl: 1, q: "Enterprise value equals equity value plus:", opts: ["Cash", "Net debt", "Revenue", "Working capital"], a: 1, why: "EV = equity value + debt - cash, which is net debt added to equity value." },
        { lvl: 1, q: "CAPM computes:", opts: ["WACC", "Cost of equity", "Terminal value", "Free cash flow"], a: 1, why: "CAPM gives cost of equity, which then feeds the equity component of WACC." },
        { lvl: 2, q: "Which is NOT subtracted in unlevered free cash flow?", opts: ["Taxes on EBIT", "Capital expenditure", "Interest expense", "Increase in net working capital"], a: 2, why: "Interest is a financing item and is excluded from unlevered cash flow by definition." },
        { lvl: 2, q: "Terminal value typically represents what share of a 5-year DCF?", opts: ["10-20%", "30-40%", "60-80%", "Under 10%"], a: 2, why: "The majority of value sits beyond the explicit forecast, which is why terminal assumptions deserve the most scrutiny." },
        { lvl: 3, q: "WACC rises from 9% to 10%. The effect on valuation is:", opts: ["A small decrease", "A substantial decrease, amplified through the terminal value", "No change", "An increase"], a: 1, why: "The terminal value denominator (WACC minus g) is highly sensitive, so a one-point move has an outsized effect." },
        { lvl: 3, q: "You must relever beta because a comparable's raw beta:", opts: ["Is always understated", "Reflects that company's own leverage rather than your subject's", "Uses the wrong index", "Is computed over too short a period"], a: 1, why: "Beta must be adjusted to the subject's capital structure to give a correct cost of equity." },
        { lvl: 4, q: "Your comparable set includes companies with EV/EBITDA from 6x to 24x. The correct response is:", opts: ["Use the average", "Investigate what drives the spread and tighten the set to genuinely similar companies, reporting the range", "Use the median only", "Use the highest, as growth justifies it"], a: 1, why: "A spread that wide means the set is not comparable; averaging over it produces a number with no analytical meaning." },
        { lvl: 4, q: "A DCF and a comps analysis differ by 40%. The most useful next step is:", opts: ["Average the two", "Identify which specific assumption drives the gap and whether the market is pricing something your forecast does not capture", "Trust the DCF", "Trust the comps"], a: 1, why: "The disagreement itself is the finding; reconciling it usually reveals an assumption worth examining." },
        { lvl: 5, q: "The most honest way to present a DCF output is:", opts: ["A single value", "A range from a sensitivity table across WACC and terminal growth, with the assumptions stated", "The midpoint of DCF and comps", "The highest defensible value"], a: 1, why: "A point estimate implies a precision the method cannot support; the sensitivity table is the actual output." },
        { lvl: 5, q: "A management forecast shows margins expanding 800bps over five years while every comparable has been flat. You should:", opts: ["Use management's forecast, they know the business", "Model it as an upside case and use a defensible base case, stating explicitly what would need to be true for the expansion", "Reject the forecast", "Split the difference"], a: 1, why: "Management cases are inputs, not conclusions. Making the required conditions explicit is what turns an unsupported forecast into a testable one." }
      ],
      project: {
        title: "Value a public company two ways",
        brief: "Build a DCF and a comparables analysis for one public company. Cross-check the implied exit multiple against the comp range, produce a sensitivity table, and write a one-page defense of your three most contested assumptions."
      }
    },
    {
      id: "excel-fa",
      name: "Advanced Excel for Finance",
      lens: "Scenarios, sensitivity tables, model controls",
      summary: "The Excel a finance team expects: scenario switches, data tables, and the controls that make a model survive review.",
      lessons: [
        {
          title: "Scenario switches",
          body: "A model should carry base, upside, and downside cases that a reviewer can flip between without editing formulas. The standard mechanism is one scenario number in a control cell, with CHOOSE or INDEX pulling the right assumption row for every driver.\n\nBuild it as a block: each assumption gets a row with its three cases side by side, and the live value is CHOOSE(scenario, base, upside, downside). Every calculation references the live cell, never the case cells directly.\n\nThe discipline that makes it work is that no assumption lives outside this block. The moment one driver is typed directly into a formula, the scenario switch stops producing a coherent case, and the model quietly reports a blend of two scenarios that describes nothing."
        },
        {
          title: "Data tables for sensitivity",
          body: "A two-variable data table computes an output across a grid of two inputs, which is how a DCF's WACC and terminal growth sensitivity gets built. The setup is unusual enough to trip people: the output formula goes in the top-left corner of the grid, one variable runs across the top row, the other down the left column, and Data Table takes the row and column input cells.\n\nTwo cautions. Data tables recalculate on every workbook change and can make a large model unusable, so setting calculation to automatic except data tables is standard practice. And the input cells must be on the same sheet as the table, which is why sensitivity analyses often live beside the assumptions rather than on a separate output tab.\n\nThe output of a valuation is this grid, not a single cell. Presenting the grid communicates the uncertainty honestly and preempts the first question any reviewer asks."
        },
        {
          title: "Controls that make a model reviewable",
          body: "Beyond correctness, a model needs controls that let someone else trust it quickly.\n\nColour convention: blue for inputs, black for formulas, green for links to other sheets. It is nearly universal in finance and lets a reviewer see at a glance where the assumptions are.\n\nChecks: the balance check, a cash flow tie between the statement and the balance sheet movement, and a flag row that aggregates every check into one visible pass or fail. Put the aggregate flag at the top of every sheet so a broken model announces itself immediately.\n\nAnd no hardcoded numbers inside formulas, ever. If a formula contains a number other than 0, 1, or a genuine constant, it belongs in the input block. This single rule catches more model errors in review than any other convention."
        }
      ],
      practice: [
        {
          prompt: "Your scenario switch is set to downside but revenue looks like the base case. What do you check?",
          answer: "Find the driver that is not wired through the switch. Trace precedents on the revenue line: somewhere it references a base-case cell directly, or a growth rate was typed into the formula rather than pulled from the assumption block. A quick systematic check is to change every downside assumption to an obviously extreme value and see which outputs fail to move; those are the lines bypassing the switch."
        },
        {
          prompt: "Why does a large model with several data tables become unusably slow?",
          answer: "Data tables recalculate across their entire grid on every workbook recalculation, so a 10x10 table means 100 full recalculations of the dependent chain each time anything changes. Set calculation to Automatic Except Data Tables, which leaves normal formulas live and refreshes tables on demand with F9. Reducing grid size and limiting the number of tables in one workbook also helps materially."
        }
      ],
      quiz: [
        { q: "A scenario switch typically uses:", opts: ["VLOOKUP", "CHOOSE or INDEX driven by a single control cell", "Conditional formatting", "Goal Seek"], a: 1, why: "One control cell selecting from a case block keeps every driver consistent within a scenario." },
        { q: "In a two-variable data table, the output formula goes:", opts: ["In the top-left corner cell of the grid", "Above the grid", "In a separate sheet", "In the first data cell"], a: 0, why: "Excel requires the formula reference in the corner, with variables along the top row and left column." },
        { q: "A number typed inside a formula rather than referenced from an input block is a problem because:", opts: ["It slows calculation", "It is invisible to a reviewer and will not respond to scenario changes", "Excel cannot audit it", "It breaks data tables"], a: 1, why: "Hardcoded values inside formulas are the most common hiding place for model errors." }
      ],
      assessment: [
        { lvl: 1, q: "The finance convention for input cells is:", opts: ["Red text", "Blue text", "Bold black", "Italic"], a: 1, why: "Blue for inputs, black for formulas, green for cross-sheet links is the near-universal standard." },
        { lvl: 1, q: "Goal Seek is used to:", opts: ["Run multiple scenarios", "Find the input value that produces a target output", "Build sensitivity grids", "Optimize multiple variables"], a: 1, why: "It solves backward for a single input; Solver handles multiple variables with constraints." },
        { lvl: 2, q: "Setting calculation to 'Automatic Except Data Tables' addresses:", opts: ["Circular references", "Performance, since data tables recalculate their entire grid on every change", "Formula errors", "Link updates"], a: 1, why: "Data tables are the dominant source of recalculation cost in large finance models." },
        { lvl: 2, q: "An INDEX/MATCH is preferred over VLOOKUP partly because:", opts: ["It is faster to type", "It survives column insertion and can look left of the key", "It handles errors better", "It supports wildcards"], a: 1, why: "Positional column indexes break silently when the source range changes." },
        { lvl: 3, q: "A model's scenario switch changes some outputs but not others. This means:", opts: ["The switch formula is wrong", "Some drivers bypass the switch and reference case cells or hardcoded values directly", "Calculation is set to manual", "The scenarios are too similar"], a: 1, why: "Partial response is the signature of an assumption not wired through the control cell." },
        { lvl: 3, q: "Which check most directly validates a three-statement model?", opts: ["Row count", "Assets minus liabilities minus equity equals zero, displayed prominently", "Formula count", "Sum of revenue"], a: 1, why: "The balance check is the integrity test the whole model structure depends on." },
        { lvl: 4, q: "A shared model recalculates differently for a colleague. The most likely cause is:", opts: ["Different monitor resolution", "Manual calculation mode, a volatile function, or an iterative-calculation setting that differs between machines", "File corruption", "Excel version"], a: 1, why: "Calculation settings and volatile or locale-dependent functions are the usual culprits." },
        { lvl: 4, q: "The best way to expose model risk to a reviewer is:", opts: ["A written assumptions memo", "A sensitivity grid on the two assumptions that move the output most, alongside the base case", "More decimal places", "A longer model"], a: 1, why: "The grid quantifies which assumptions matter and by how much, which a memo cannot do as directly." },
        { lvl: 5, q: "A model used for a live transaction has no version control. The primary risk is:", opts: ["File size growth", "Different parties working from different versions, with no way to determine which numbers are current or what changed", "Slow performance", "Formula corruption"], a: 1, why: "Version divergence in live transactions produces decisions made on superseded numbers." },
        { lvl: 5, q: "You find a formula error affecting outputs already circulated to a client. The correct action is:", opts: ["Fix it quietly in the next version", "Correct it, quantify the impact on every affected output, and notify the recipients promptly", "Add a disclaimer", "Wait until asked"], a: 1, why: "Prompt disclosure with quantified impact is both the professional and the risk-minimizing response; silent correction compounds the error into a conduct problem." }
      ],
      project: {
        title: "Scenario-driven model with controls",
        brief: "Build a model with a three-case scenario switch, a two-variable sensitivity table, the blue/black/green convention, and an aggregate check flag. Verify every driver responds to the switch."
      }
    },
    {
      id: "variance-fa",
      name: "Budgeting & Variance Analysis",
      lens: "Budget vs actual, price/volume/mix, forecasting",
      summary: "Explaining why actuals differ from plan is the recurring core of FP&A. This track covers variance decomposition, flexible budgets, and forecasts that get revised honestly.",
      lessons: [
        {
          title: "Decompose before you explain",
          body: "A revenue variance of negative $400k is not an explanation, it is a prompt. The work is decomposing it into price, volume, and mix.\n\nPrice variance is the change in price times actual volume. Volume variance is the change in volume times budgeted price. Mix variance captures the effect of selling a different composition of products at different margins, which matters whenever a portfolio has meaningfully different unit economics.\n\nThe decomposition is what makes the variance actionable. A volume shortfall points at demand or sales capacity. A price shortfall points at discounting or competitive pressure. A mix shortfall with volume on plan means the sales team hit its number by selling the wrong things, which is a compensation design problem rather than a demand problem, and only the decomposition reveals it."
        },
        {
          title: "Flexible budgets",
          body: "Comparing actual costs at actual volume against a budget built for a different volume conflates two effects and produces a meaningless variance. If volume came in 20% below plan, variable costs should be lower, and reporting that as a favorable cost variance rewards a shortfall.\n\nThe flexible budget re-states the budget at actual volume. Variable costs flex with volume; fixed costs do not. The resulting comparison isolates the efficiency variance, which is the part management can actually act on, from the volume variance, which belongs to the revenue discussion.\n\nThis requires the cost structure to be correctly classified as fixed or variable, and semi-variable costs need to be split. That classification is genuine analytical work and it is where flexible budgeting usually goes wrong, since most cost lines are treated as one or the other by convention rather than by behavior."
        },
        {
          title: "Forecasts that get revised honestly",
          body: "A rolling forecast updated monthly beats an annual budget that becomes fiction by month four. The obstacle is rarely technical: it is that revising a forecast downward is read as failure, so forecasts get held at plan long past the point anyone believes them.\n\nThree practices help. Separate the forecast from the target, so the forecast can move without conceding the goal. Track forecast accuracy as its own metric, which makes systematic optimism visible and correctable. And require a written driver explanation for each revision, which distinguishes a genuine change in conditions from a number adjusted to please.\n\nA useful diagnostic: if your forecast has never been revised upward, it is not a forecast, it is a negotiating position."
        }
      ],
      practice: [
        {
          prompt: "Revenue is $200k below plan. Volume is on plan. What happened and what do you investigate?",
          answer: "With volume on plan, the shortfall is price or mix. Compute both: price variance as the change in realized price times actual volume, and mix variance from the shift in product composition. If it is price, investigate discounting authority, competitive moves, and whether a large customer renegotiated. If it is mix, the sales team hit volume by selling lower-priced or lower-margin products, which usually points at how quota and commission are structured rather than at demand."
        },
        {
          prompt: "Volume came in 20% below budget and the cost variance looks favorable. Is that good news?",
          answer: "Probably not. Variable costs should fall with volume, so a favorable raw variance may simply reflect the shortfall. Rebuild the comparison as a flexible budget at actual volume: flex the variable costs, hold fixed costs, and compare actuals against that. If costs are still favorable against the flexed budget, that is a real efficiency gain. If they are unfavorable, costs actually rose per unit while volume fell, which is the worse case and the raw variance was hiding it."
        }
      ],
      quiz: [
        { q: "Price variance is calculated as:", opts: ["Change in price times budgeted volume", "Change in price times actual volume", "Change in volume times actual price", "Actual revenue minus budgeted revenue"], a: 1, why: "Isolating the price effect requires holding volume at actual so the two effects do not double count." },
        { q: "A flexible budget restates the budget at:", opts: ["Actual prices", "Actual volume", "Prior year levels", "Forecast volume"], a: 1, why: "Flexing to actual volume separates the efficiency variance from the volume variance." },
        { q: "A forecast that has never been revised upward suggests:", opts: ["Strong forecasting discipline", "It functions as a negotiating position rather than a genuine estimate", "Conservative accounting", "Stable business conditions"], a: 1, why: "A real forecast moves in both directions as conditions change; systematic one-directionality indicates bias." }
      ],
      assessment: [
        { lvl: 1, q: "A favorable variance means actual results were:", opts: ["Higher than budget", "Better than budget for that line, which means higher revenue or lower cost", "Lower than budget", "Equal to prior year"], a: 1, why: "Direction depends on the line: favorable is higher revenue or lower cost." },
        { lvl: 1, q: "Fixed costs in a flexible budget:", opts: ["Flex with volume", "Stay constant regardless of volume", "Are excluded", "Are allocated per unit"], a: 1, why: "Only variable costs flex; that distinction is the mechanism of the flexible budget." },
        { lvl: 2, q: "Mix variance arises when:", opts: ["Prices change", "Total volume changes", "The composition of products sold differs from plan", "Costs change"], a: 2, why: "Different products carry different prices and margins, so composition affects the total independently of price and volume." },
        { lvl: 2, q: "Comparing actual costs at actual volume against an unflexed budget is misleading because:", opts: ["It uses the wrong period", "It conflates the volume effect with the efficiency effect", "It ignores fixed costs", "It requires allocation"], a: 1, why: "A volume shortfall produces an apparently favorable cost variance that reflects nothing about efficiency." },
        { lvl: 3, q: "Volume on plan, revenue below plan, average selling price flat. The remaining explanation is:", opts: ["Price discounting", "Mix shift toward lower-priced products within the portfolio", "Volume miscounting", "Timing"], a: 1, why: "With overall volume and average price flat, a composition shift is the only remaining source." },
        { lvl: 3, q: "Costs are unfavorable against the flexed budget while volume fell 20%. This indicates:", opts: ["Normal variance", "Per-unit costs rose, which is worse than the raw variance suggested", "A classification error", "Fixed costs increased"], a: 1, why: "Flexing removes the volume effect, so remaining unfavorability is genuine cost deterioration." },
        { lvl: 4, q: "Which variance most often points to a compensation design problem rather than a market problem?", opts: ["Volume variance", "Mix variance with volume on plan", "Price variance", "Fixed cost variance"], a: 1, why: "Hitting volume with an unfavorable mix usually reflects what the incentive structure rewards." },
        { lvl: 4, q: "Your rolling forecast is consistently 8% optimistic. The most effective fix is:", opts: ["Apply an 8% haircut", "Track forecast accuracy by owner as a visible metric and require driver-level explanations for revisions", "Forecast less frequently", "Move to annual budgeting"], a: 1, why: "A blanket haircut hides the bias without correcting it and breaks the moment behavior changes." },
        { lvl: 5, q: "A business unit consistently beats budget every quarter. The most useful interpretation is:", opts: ["Excellent performance", "The budget may be set too conservatively, which distorts capital allocation across units", "The forecast is accurate", "Costs are well controlled"], a: 1, why: "Sandbagged budgets misallocate resources toward units that appear to overperform, which is a governance problem." },
        { lvl: 5, q: "Separating the forecast from the target matters because:", opts: ["It simplifies reporting", "It lets the forecast reflect expected reality without being read as abandoning the goal, which is what keeps forecasts honest", "Targets change less often", "It satisfies audit requirements"], a: 1, why: "When the two are conflated, every downward revision reads as surrender, so forecasts stop being informative exactly when they matter most." }
      ],
      project: {
        title: "Full variance bridge",
        brief: "Build a bridge from budgeted to actual revenue decomposed into price, volume, and mix, plus a flexible budget for costs. Write the one-page commentary a CFO would read, with the action each variance implies."
      }
    },
    {
      id: "sql-fa",
      name: "SQL for Financial Analysts",
      lens: "GL queries, period logic, reconciliation, audit trails",
      summary: "The finance lens on SQL: general ledger structure, period-close logic, reconciling to the trial balance, and queries that produce numbers you can defend in an audit.",
      lessons: [
        {
          title: "The general ledger's shape",
          body: "A GL table is a long list of journal entry lines, each with an account, a period, a debit or credit amount, an entity, and a cost centre. Almost every finance query is an aggregation over this table with the right filters.\n\nThe conventions that trip newcomers: debits and credits may be stored as separate columns or as one signed amount, and the sign convention for revenue and liabilities is often negative, so a naive SUM returns a negative revenue figure that looks wrong but is not. Confirm the convention before writing anything.\n\nPeriod matters more than date. Finance operates on accounting periods, and an entry posted on October 2 may belong to period 9. Filtering on the transaction date rather than the period is the single most common way a finance query silently disagrees with the reported numbers."
        },
        {
          title: "Period logic and the close",
          body: "Period-over-period comparisons need care about what is included. A period that is still open will change, so comparing an open period against closed ones produces a moving number that someone will screenshot and quote back to you.\n\nAdjusting entries posted during close, and often after it, mean that a query run on day 3 of close gives a different answer than the same query on day 10. Always state the run timestamp and the period status alongside any figure.\n\nYear-to-date logic must respect the fiscal calendar, not the calendar year. A fiscal year starting in April makes YTD in September mean six months, and a query using calendar year-to-date silently reports nine. When the company has multiple entities on different fiscal calendars, this has to be handled per entity rather than globally."
        },
        {
          title: "Reconciling and leaving an audit trail",
          body: "A finance query is only finished when it ties to something independent: the trial balance, the reported financials, or the source system's own total. Reconciliation is not a formality, it is the step that catches the filter you forgot.\n\nWhen it does not tie, work through the standard causes in order: period versus date filtering, excluded entities or intercompany eliminations, sign convention, adjusting entries posted after your snapshot, and currency translation on foreign entities.\n\nThe audit trail is equally part of the deliverable. Save the query, the run timestamp, the period status, and the reconciliation result together. When someone asks in four months how a number was derived, that package is the answer, and reproducing the number without it is often impossible once the underlying data has moved on."
        }
      ],
      practice: [
        {
          prompt: "Your revenue query returns a negative number. Is it wrong?",
          answer: "Probably not. In most general ledgers revenue is stored as a credit, which is commonly a negative signed amount. Confirm the convention, then either multiply by negative one for presentation or use the debit and credit columns explicitly. The real error would be applying the flip inconsistently across accounts, so document the convention once and apply it in a single place rather than scattering sign flips through the query."
        },
        {
          prompt: "Your query ties to the trial balance for eleven months and misses the twelfth. Where do you look?",
          answer: "The final period is where adjusting entries concentrate, so start there: entries posted after your snapshot, year-end accruals, and audit adjustments. Then check period versus date filtering, since a December 31 transaction date may belong to period 12 or to an adjusting period 13, which many systems maintain separately. If the company has foreign entities, year-end currency revaluation is another candidate that appears only in the final period."
        }
      ],
      quiz: [
        { q: "Filtering GL data by transaction date rather than accounting period risks:", opts: ["Slower queries", "Numbers that disagree with reported financials, since entries can post in a different period than their date", "Missing indexes", "Duplicate rows"], a: 1, why: "Finance reports on periods; date filtering silently includes and excludes the wrong entries." },
        { q: "A query run during close gives different answers on different days because:", opts: ["The database is unstable", "Adjusting entries are still being posted to the open period", "Caching", "Timezone drift"], a: 1, why: "Open periods change until closed, which is why the run timestamp and period status must accompany any figure." },
        { q: "Year-to-date logic must respect:", opts: ["The calendar year", "The fiscal calendar, which may differ by entity", "The reporting currency", "The close schedule"], a: 1, why: "A non-calendar fiscal year makes calendar YTD silently wrong, and multi-entity groups can have several." }
      ],
      assessment: [
        { lvl: 1, q: "In a general ledger, revenue is typically recorded as:", opts: ["A debit", "A credit", "Either, depending on the month", "Neither"], a: 1, why: "Revenue increases with credits, which in many systems are stored as negative signed amounts." },
        { lvl: 1, q: "The correct field to filter a monthly finance report is:", opts: ["Transaction date", "Accounting period", "Created timestamp", "Approval date"], a: 1, why: "Reported figures are period-based, and entries can be posted to a period other than their transaction date." },
        { lvl: 2, q: "Your GL query excludes intercompany eliminations. The consolidated total will be:", opts: ["Correct", "Overstated, since intercompany transactions are counted in both entities", "Understated", "Unaffected"], a: 1, why: "Without eliminations, transactions between group entities are double counted." },
        { lvl: 2, q: "Trial balance reconciliation exists to:", opts: ["Speed up the close", "Verify your query's total ties to an independent source before the number is used", "Satisfy the auditor only", "Check data types"], a: 1, why: "Tying out is what catches a forgotten filter before the number reaches a decision." },
        { lvl: 3, q: "A query ties for 11 months and misses month 12. Check first:", opts: ["Index fragmentation", "Adjusting and year-end entries posted after your snapshot, including any adjusting period", "Join logic", "Column types"], a: 1, why: "Year-end adjustments concentrate in the final period and often post to a separate adjusting period." },
        { lvl: 3, q: "For a group with entities on different fiscal calendars, YTD must be computed:", opts: ["Globally on the parent calendar", "Per entity against its own fiscal calendar, then consolidated", "On the calendar year for consistency", "Only at year end"], a: 1, why: "A single global calendar misstates YTD for every entity that does not share it." },
        { lvl: 4, q: "Foreign entity balances translated at different rates cause your consolidated total to differ. The correct handling is:", opts: ["Use the year-end rate for everything", "Apply the policy rates: average rate for income statement items, closing rate for balance sheet items, with translation differences to equity", "Convert at the transaction date rate", "Report in local currency"], a: 1, why: "Mixed-rate translation is the standard policy, and applying a single rate misstates both the results and the reconciliation." },
        { lvl: 4, q: "The most defensible finance query deliverable includes:", opts: ["The number alone", "The number, the query, the run timestamp, the period status, and the reconciliation result", "The number and a chart", "The number and the source table name"], a: 1, why: "Finance numbers must be reproducible and auditable months later, which requires the full package." },
        { lvl: 5, q: "A recurring finance report has silently drifted from the reported figures over six months. The most likely structural cause is:", opts: ["Database migration", "A definition change upstream, such as a new account, entity, or cost centre not captured by the query's hardcoded filters", "Query performance degradation", "Rounding accumulation"], a: 1, why: "Hardcoded account and entity lists go stale as the chart of accounts changes, and nothing in the query announces it." },
        { lvl: 5, q: "The strongest control against a finance query producing wrong numbers over time is:", opts: ["Peer review at build time", "An automated reconciliation to the trial balance that runs with the report and fails loudly when it does not tie", "Detailed documentation", "Quarterly manual checks"], a: 1, why: "A tie-out that runs every time catches drift the moment it appears; point-in-time reviews and documentation do not." }
      ],
      project: {
        title: "Reconciled P&L from the GL",
        brief: "Build a monthly P&L query from raw GL data with correct period logic, entity handling, and sign convention. Include an automated trial balance tie-out and produce the full audit package for one period."
      }
    }
  ]
});
