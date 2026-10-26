/* Sample documents for the resume check. Resumes first, then documents that are not resumes. */
export const RESUMES = {
  "full PM resume": `PRATHAM JAIN
Los Angeles, CA | pratham@example.com | (213) 555-0142 | linkedin.com/in/prathamjain

EDUCATION
University of Southern California, Los Angeles, CA
M.S. Engineering Management, GPA 3.92, expected May 2027
Bachelor of Science, Computer Science, 2021

EXPERIENCE
Senior Conversational Bot Engineer, Quantiphi, Mumbai, India    Jun 2021 - Aug 2024
- Led a team of 4 engineers building enterprise voice bots for healthcare and telecom clients.
- Designed a retrieval pipeline that cut handling time by 32% and saved $400K a year.
- Partnered with product and sales to launch three customer pilots in six months.

Salesforce Developer Intern, Persistent Systems    May 2020 - Jul 2020
- Built 12 automation flows and trained 20 users.

SKILLS
Python, SQL, Dialogflow CX, RAG, Jira, stakeholder management`,

  "short student resume": `Maria Gonzalez
maria.g@usc.edu  (310) 555-0100

Education
B.A. Economics, University of California, 2022 - 2026. GPA 3.6.

Experience
Marketing Intern, BrightPath Media, Jun 2025 - Aug 2025
Created weekly reports and managed a social media calendar. Analyzed campaign results and presented findings to the team.

Student Government, Treasurer, 2023 - 2024
Managed a $12,000 budget and organized four events.

Skills: Excel, Canva, public speaking`,

  "career switcher, no bullets": `John Okafor john.okafor@gmail.com 415-555-0199 San Francisco
Summary Operations manager with eight years running warehouse teams, moving into project management.
Work Experience
Operations Manager, Pacific Freight, 2018 - Present. Oversaw a team of 35, reduced shipping errors by 18%, and delivered a new scheduling system on time and under budget.
Shift Supervisor, Pacific Freight, 2015 - 2018. Trained new hires and coordinated daily dispatch.
Education
Bachelor of Business Administration, San Jose State University, 2014
Certifications
Lean Six Sigma Green Belt, 2020`,

  "LaTeX style, all caps headings": `JANE LI
jane.li@example.edu | github.com/janeli | +1 626 555 0188
EDUCATION
Georgia Institute of Technology    Aug 2020 - May 2024
B.S. Computer Science
PROJECTS
Campus Rideshare App - Built a React Native app used by 1,200 students; implemented matching algorithm in Python.
Course Planner - Developed a web tool with Flask and PostgreSQL.
EXPERIENCE
Software Engineering Intern, Stripe, May 2023 - Aug 2023
Improved the reliability of a payments API and reduced p95 latency by 14%.
SKILLS
Python, JavaScript, SQL, Git, AWS`,

  "text-only pasted summary resume": `Priya Nair
priya.nair@outlook.com
Professional Summary
Business analyst with five years in banking, skilled in requirements gathering, process mapping and SQL.
Professional Experience
Business Analyst, First Union Bank, Jan 2021 - Present
Gathered requirements from 12 stakeholders, mapped as-is and to-be processes, and wrote user stories for a loan origination upgrade.
Associate Analyst, First Union Bank, Jul 2019 - Dec 2020
Built SQL reports and reconciled monthly balances.
Education
MBA, Boston University, 2019`
};

export const NOT_RESUMES = {
  "job description": `Senior Project Manager - Acme Corp
About the role
We are looking for a Senior Project Manager to lead delivery of our cloud migration program.
Responsibilities
- You will own the project plan, budget and risk register.
- Partner with engineering leads to manage dependencies.
Qualifications
- 7+ years of project management experience; PMP preferred.
- Strong communication skills.
Benefits
Health insurance, 401k, remote-friendly. Acme is an equal opportunity employer. Apply now at careers.acme.com.`,

  "research paper": `Abstract
We study the effect of sleep on memory consolidation in adolescents. Keywords: sleep, memory, adolescents.
1. Introduction
Sleep plays a central role in memory (Smith et al., 2015). Prior work has shown mixed results (Lee et al., 2018; doi:10.1000/xyz).
2. Methodology
We recruited 120 participants. Figure 1 shows the protocol. Table 2 lists the results.
3. Conclusion
Our findings suggest a modest effect. Acknowledgments. This work was funded by a grant.
References
Smith, J. et al. (2015). Sleep and memory. Journal of Sleep, 12(3).`,

  "invoice": `INVOICE #20931
Bill To: Northwind Retail, 400 Market Street, Chicago, IL
Date: March 4, 2026   Payment terms: Net 30
Description                Qty   Amount
Consulting services         40   $6,000.00
Subtotal $6,000.00  Tax $480.00  Total due $6,480.00
Questions: billing@vendor.com | (312) 555-0111
Terms and conditions apply. Signature: ______`,

  "cover letter": `Dear Hiring Manager,
I am writing to express my interest in the Product Manager position at Acme. I have led several launches and enjoy working with engineers and designers. I would welcome the opportunity to discuss how my background fits your team.
Thank you for your time and consideration.
Sincerely,
Alex Rivera
alex@usc.edu | (213) 555-0123`,

  "lecture notes": `Lecture 4: Supply and demand
When the price of a good rises, the quantity demanded falls. This is the law of demand. The demand curve slopes downward. Shifts in the curve come from income, tastes and the prices of related goods. Equilibrium is where supply equals demand. In the next lecture we cover elasticity and how firms respond to price changes. Practice problem: if demand falls by 10% and supply is unchanged, what happens to the equilibrium price?`,

  "news article": `LOS ANGELES - City officials announced on Tuesday a new plan to expand bus lanes along Wilshire Boulevard, a project that is expected to take three years and cost about $90 million. Supporters say the plan will reduce commute times, while critics worry about the effect on local businesses. The council will vote next month. "This is a long overdue investment," said one council member.`,

  "course syllabus": `MOR 531 Syllabus - Fall 2026
Instructor: Prof. Alif. Office hours: Tuesdays 2-4pm. Email: alif@usc.edu
Course description: This course introduces the principles of managing product teams.
Grading: Participation 20%, Team project 40%, Midterm 20%, Final 20%.
Week 1: Introduction. Week 2: Discovery. Week 3: Roadmaps. Readings are posted on Blackboard.
Academic integrity: All work must be your own.`,

  "transcript": `UNIVERSITY OF SOUTHERN CALIFORNIA OFFICIAL TRANSCRIPT
Student: Pratham Jain   ID: 1234567890
Fall 2025: MOR 530 Strategic Leadership A; ENGR 597 Practicum A-; MKT 512 Consumer Insights A
Spring 2026: MOR 531 Team Project A; ENGR 520 Systems B+
Cumulative GPA: 3.92. Degree: Master of Science, expected May 2027.`,

  "random pdf junk": `Page 1 of 3  Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.`,

  "I-20": `U.S. DEPARTMENT OF HOMELAND SECURITY U.S. Immigration and Customs Enforcement Form I-20 Certificate of Eligibility for Nonimmigrant Student Status
SEVIS ID: N0012345678 School Code: LOS214F00000000 Surname: ORTIZ Given Name: SAMANTHA Birth Date: 03 MAR 1999 Country of Birth: INDIA Country of Citizenship: INDIA
School Name: University of Southern California Program of Study Education Level: Master's Major 1: Engineering Management
Program Start Date: 18 AUG 2025 Program End Date: 15 MAY 2027 Financial Information Tuition and Fees: $62,000 Personal funds: $90,000
School Attestation: I certify that the information was completed by me. Designated School Official: J. SMITH Date issued: 06 JUN 2025 Signature of student`,

  "visa": `UNITED STATES OF AMERICA NONIMMIGRANT VISA Type: F1 Class: F1 Entries: M Annotation: SEVIS N0012345678
Surname: ORTIZ Given Names: SAMANTHA Passport Number: Z1234567 Nationality: INDIA Date of Birth: 03 MAR 1999 Sex: F
Issue Date: 12 JUL 2025 Expiration Date: 12 JUL 2030 Issuing Post: MUMBAI Control Number: 20251930000123`,

  "passport page": `PASSPORT Type P Country code IND Passport No. Z1234567 Surname ORTIZ Given names SAMANTHA Nationality INDIAN Date of birth 03 MAR 1999 Place of birth MUMBAI Date of issue 12 JAN 2022 Date of expiry 11 JAN 2032 Issuing authority REGIONAL PASSPORT OFFICE MUMBAI`,

  "bank statement": `FIRST NATIONAL BANK Account Statement Account number: 1234 5678 9012 Routing number: 021000021 Statement period: 01 Sep 2026 - 30 Sep 2026
Opening balance: $4,210.55 Closing balance: $3,982.10 09/02 Rent payment -1,450.00 09/05 Payroll deposit 2,100.00 Total deposits $2,100.00 Questions? Call 1-800-555-0100.`,

  "offer letter": `Dear Alex, We are pleased to offer you the position of Associate Product Manager at Acme Inc., reporting to the Director of Product. Your start date will be October 1, 2026. Your annual base salary will be paid bi-weekly. This offer is contingent on a background check. Please sign and return this letter by September 15. Sincerely, People Team, hr@acme.com, (415) 555-0100`,

  "flight itinerary": `E-TICKET ITINERARY Passenger: ORTIZ/SAMANTHA MS Booking reference: K7P2QX Flight UA 837 LAX to SFO Departure 12 OCT 2026 07:45 Arrival 09:05 Seat 14C Baggage: 1 checked bag Boarding closes 20 minutes before departure. Contact: reservations@airline.com`,

  "tax form": `Form W-2 Wage and Tax Statement 2025 Employee's social security number XXX-XX-1234 Employer identification number 12-3456789 Wages, tips, other compensation 82,500.00 Federal income tax withheld 11,200.00 Social security wages 82,500.00 Employee name ORTIZ SAMANTHA State: CA`,

  "ID card": `UNIVERSITY OF SOUTHERN CALIFORNIA STUDENT ID Name: ORTIZ, SAMANTHA USC ID: 1234567890 Date of birth: 03/03/1999 Valid through: 05/2027 Program: M.S. Engineering Management Issued: 08/2025 If found please return to Student Affairs, Los Angeles CA`
};
