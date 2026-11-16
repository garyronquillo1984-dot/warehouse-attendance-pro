"""Shared constants / styling helpers for the workbook build."""
import json, os
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter as gl

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(HERE, 'config.json')))

D = '01 – Executive Dashboard'
R = '02 – Country Ranking'
P = '03 – Policy Section Analysis'
CD = '04 – Country Details'
RK = '05 – Regional Risk Assessment'
AP = '06 – Regional Action Plan'
SD = '07 – Source Data'
CF = '08 – Config & Methodology'
AR = '09 – Historical Archive'
AU = '10 – Audit Report'
CL = '11 – Change Log'
KF = '12 – Key Regional Findings'
CE = '13 – Calc Engine'
NEW_SHEETS = [D, R, P, CD, RK, AP, SD, CF, AR, AU, CL, KF, CE]


def q(name):
    return "'" + name.replace("'", "''") + "'"


FONT = 'Arial'
NAVY = '1F3864'
BLUE = '2F5597'
LIGHT = 'D9E1F2'
PALE = 'F2F2F2'
WHITE = 'FFFFFF'
# status palette (fill, font)
GREEN = ('C6EFCE', '006100')
YELLOW = ('FFEB9C', '7F6000')
ORANGE = ('F8CBAD', '833C0B')
RED = ('FFC7CE', '9C0006')
GREY = ('D9D9D9', '404040')
INPUT_FILL = 'FFF2CC'

thin = Side(style='thin', color='BFBFBF')
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)


def font(bold=False, size=10, color='000000', italic=False):
    return Font(name=FONT, bold=bold, size=size, color=color, italic=italic)


def fill(c):
    return PatternFill('solid', start_color=c, end_color=c)


def put(ws, ref, value, bold=False, size=10, color='000000', bg=None, fmt=None, wrap=False,
        align=None, valign='top', italic=False, border=False):
    c = ws[ref]
    c.value = value
    c.font = font(bold, size, color, italic)
    if bg:
        c.fill = fill(bg)
    if fmt:
        c.number_format = fmt
    c.alignment = Alignment(wrap_text=wrap, horizontal=align, vertical=valign)
    if border:
        c.border = BORDER
    return c


def header_row(ws, row, col0, headers, bg=NAVY, fg=WHITE, height=30, wrap=True):
    for j, h in enumerate(headers):
        c = ws.cell(row=row, column=col0 + j, value=h)
        c.font = font(True, 10, fg)
        c.fill = fill(bg)
        c.alignment = Alignment(wrap_text=wrap, horizontal='center', vertical='center')
        c.border = BORDER
    ws.row_dimensions[row].height = height


def title(ws, text, sub=None, width_cols=12):
    put(ws, 'A1', text, bold=True, size=16, color=NAVY)
    ws.row_dimensions[1].height = 24
    if sub:
        put(ws, 'A2', sub, italic=True, size=9, color='595959')


def nav(ws, row=3, col=1):
    """Navigation links (HYPERLINK formulas, no relationship parts needed)."""
    links = [(D, 'Dashboard'), (R, 'Ranking'), (P, 'Policy Sections'), (CD, 'Country Details'),
             (RK, 'Risk'), (AP, 'Action Plan'), (SD, 'Source Data'), (CF, 'Methodology'),
             (AR, 'Archive'), (AU, 'Audit Report'), (CL, 'Change Log'), (KF, 'Key Findings')]
    for j, (s, lab) in enumerate(links):
        c = ws.cell(row=row, column=col + j)
        c.value = f'=HYPERLINK("#{q(s)}!A1","{lab}")'
        c.font = Font(name=FONT, size=9, color='0563C1', underline='single')
        c.alignment = Alignment(horizontal='center')


def widths(ws, d):
    for k, v in d.items():
        ws.column_dimensions[k].width = v


def cell_style(c, bold=False, fmt=None, wrap=False, align=None, bg=None, color='000000', size=10, border=True, italic=False):
    c.font = font(bold, size, color, italic)
    if fmt:
        c.number_format = fmt
    c.alignment = Alignment(wrap_text=wrap, horizontal=align, vertical='top')
    if bg:
        c.fill = fill(bg)
    if border:
        c.border = BORDER


PCT = '0.0%'
DATE = 'dd-mmm-yyyy'
