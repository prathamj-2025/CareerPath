"""Builds the sample PDFs used by the resume-check tests. Run from this folder: python3 make_pdfs.py
All people, numbers and ids are invented."""
import os, subprocess, io
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, ListFlowable, ListItem
from PIL import Image, ImageDraw, ImageFont
out = 'pdfs'
os.makedirs(out, exist_ok=True)

def lines_pdf(path, lines, size=10):
    c = canvas.Canvas(path, pagesize=letter)
    y = 740
    for ln in lines:
        c.setFont('Helvetica-Bold' if ln.isupper() and len(ln) < 40 else 'Helvetica', size + (2 if ln.isupper() and len(ln) < 40 else 0))
        c.drawString(54, y, ln); y -= 14
        if y < 60: c.showPage(); y = 740
    c.save()

RESUME = """SAMANTHA ORTIZ
Los Angeles, CA | sam.ortiz@example.com | (323) 555-0147 | linkedin.com/in/samortiz

EDUCATION
University of Southern California, Los Angeles, CA
M.S. Engineering Management, expected May 2027, GPA 3.9
Arizona State University, B.S. Industrial Engineering, 2018 - 2022

EXPERIENCE
Project Coordinator, Northwind Logistics, Phoenix, AZ    Jun 2022 - Aug 2025
- Managed a 14-week warehouse migration using a Gantt chart, risk register and weekly status reports.
- Led sprint planning and retrospectives in Jira with a Scrum team of eight engineers.
- Reduced order errors by 22% and delivered the program $60K under budget.
- Coordinated three vendors and negotiated a contract that saved $40K a year.

Operations Intern, BlueLine Freight, Summer 2021
- Built a Tableau dashboard that cut reporting time from 6 hours to 30 minutes.

SKILLS
Project management, Scrum, Jira, SQL, Excel, stakeholder management, risk management

CERTIFICATIONS
Certified ScrumMaster, 2023""".split('\n')

I20 = """U.S. DEPARTMENT OF HOMELAND SECURITY
U.S. Immigration and Customs Enforcement
Form I-20  Certificate of Eligibility for Nonimmigrant Student Status
SEVIS ID: N0012345678     School Code: LOS214F00000000
Surname/Primary Name: ORTIZ
Given Name: SAMANTHA
Preferred Name:
Birth Date: 03 MAR 1999     Country of Birth: INDIA     Country of Citizenship: INDIA
Admission Number: 00000000000
School Information
School Name: University of Southern California
School Address: 3551 Trousdale Parkway, Los Angeles, CA 90089
Program of Study
Education Level: Master's     Major 1: Engineering Management
Program Start Date: 18 AUG 2025     Program End Date: 15 MAY 2027
Normal Program Length: 24 months
Financial Information (estimated average costs for an academic year)
Tuition and Fees: $62,000     Living Expenses: $24,000
Personal funds: $90,000     Total: $86,000
School Attestation: I certify that the information was completed by me and reflects the student's status.
Designated School Official: J. SMITH   Title: PDSO   Date issued: 06 JUN 2025
Student Attestation: I have read and agreed to comply with the terms and conditions of my admission.
Signature of student: ______________   Date: ____________
Travel endorsement: Valid for re-entry with the signature of a Designated School Official.
Employment Authorization: On-campus employment is authorized. CPT and OPT require approval.""".split('\n')

VISA = """UNITED STATES OF AMERICA
NONIMMIGRANT VISA
Type: F1    Class: F1    Entries: M    Annotation: SEVIS N0012345678
Surname: ORTIZ    Given Names: SAMANTHA
Passport Number: Z1234567    Nationality: INDIA
Date of Birth: 03 MAR 1999    Sex: F
Issue Date: 12 JUL 2025    Expiration Date: 12 JUL 2030
Issuing Post: MUMBAI    Control Number: 20251930000123
Visa Number: 12345678
P<INDORTIZ<<SAMANTHA<<<<<<<<<<<<<<<<<<<<<<<<<
Z12345675IND9903031F3007120<<<<<<<<<<<<<<04""".split('\n')

PASSPORT_BANK = """FIRST NATIONAL BANK  Account Statement
Account number: 1234 5678 9012    Routing number: 021000021
Statement period: 01 Sep 2026 - 30 Sep 2026
Opening balance: $4,210.55     Closing balance: $3,982.10
Date        Description                    Amount
09/02       Rent payment                   -1,450.00
09/05       Payroll deposit                 2,100.00
09/12       Groceries                         -87.40
Total deposits $2,100.00  Total withdrawals $2,328.45
Questions? Call 1-800-555-0100.""".split('\n')

lines_pdf(f'{out}/resume-simple.pdf', RESUME)
lines_pdf(f'{out}/i20.pdf', I20)
lines_pdf(f'{out}/visa.pdf', VISA)
lines_pdf(f'{out}/bank-statement.pdf', PASSPORT_BANK)

# A resume typeset with flowables (different content-stream layout), then rewritten with object streams.
styles = getSampleStyleSheet()
doc = SimpleDocTemplate(f'{out}/resume-flow.pdf', pagesize=letter)
story = [Paragraph('SAMANTHA ORTIZ', styles['Title']), Paragraph('sam.ortiz@example.com | (323) 555-0147', styles['Normal']), Spacer(1, 8)]
cur = None
for ln in RESUME[3:]:
    if not ln.strip(): continue
    if ln.isupper(): story.append(Paragraph(ln, styles['Heading2']))
    else: story.append(Paragraph(ln.replace('- ', '&bull; ', 1), styles['Normal']))
doc.build(story)
subprocess.run(['qpdf', '--object-streams=generate', '--compress-streams=y', '--stream-data=compress', f'{out}/resume-flow.pdf', f'{out}/resume-objstm.pdf'], check=False)

# A scanned document: text drawn as pixels only, wrapped in a PDF (no text layer).
def scanned(path, lines):
    img = Image.new('RGB', (1275, 1650), 'white')
    d = ImageDraw.Draw(img)
    try: f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 26)
    except Exception: f = ImageFont.load_default()
    y = 80
    for ln in lines:
        d.text((80, y), ln, fill='black', font=f); y += 38
    buf = io.BytesIO(); img.save(buf, 'JPEG', quality=80); buf.seek(0)
    c = canvas.Canvas(path, pagesize=letter)
    from reportlab.lib.utils import ImageReader
    c.drawImage(ImageReader(buf), 0, 0, width=612, height=792); c.save()
scanned(f'{out}/visa-scan.pdf', VISA)
scanned(f'{out}/i20-scan.pdf', I20)

# Subset-embedded TrueType fonts (Identity-H, ToUnicode): the way most real exports store text.
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
pdfmetrics.registerFont(TTFont('DejaVu', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
def cid_pdf(path, lines, size=10):
    c = canvas.Canvas(path, pagesize=letter)
    y = 740
    for ln in lines:
        c.setFont('DejaVu', size); c.drawString(54, y, ln); y -= 14
        if y < 60: c.showPage(); y = 740
    c.save()
cid_pdf(f'{out}/resume-cid.pdf', RESUME)
cid_pdf(f'{out}/i20-cid.pdf', I20)
cid_pdf(f'{out}/visa-cid.pdf', VISA)
subprocess.run(['qpdf', '--object-streams=generate', f'{out}/i20-cid.pdf', f'{out}/i20-cid-objstm.pdf'], check=False)

# Also an image file
img = Image.new('RGB', (800, 500), 'white'); ImageDraw.Draw(img).text((40, 40), 'visa photo', fill='black'); img.save(f'{out}/visa-photo.jpg')

# Word versions for the docx path
open(f'{out}/_resume.txt', 'w').write('\n'.join(RESUME))
subprocess.run(['soffice', '--headless', '--convert-to', 'docx', '--outdir', out, f'{out}/_resume.txt'], capture_output=True)
if os.path.exists(f'{out}/_resume.docx'): os.rename(f'{out}/_resume.docx', f'{out}/resume.docx')
os.remove(f'{out}/_resume.txt')
for f in sorted(os.listdir(out)): print(f, os.path.getsize(f'{out}/{f}'))
