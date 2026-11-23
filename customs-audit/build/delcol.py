"""Delete the hidden 'Test questions' column (E) from the six 9-column country forms and
re-point every reference in the workbook package (cells, formulas, cols, filters, CF,
merges, selections, comments, defined names, VLOOKUP column numbers)."""
import re, html
from openpyxl.utils import column_index_from_string as ci, get_column_letter as gl

SHEETS = ['Venezuela', 'Uruguay', 'Trinidad', 'USA', 'Argentina', 'Bolivia']
DEL = 5          # column E
ARCH = '15 – Test Questions Archive'
ARCH_COL = {s: gl(2 + i) for i, s in enumerate(SHEETS)}   # B..G in the archive sheet
ARCH_R0, ARCH_R1 = 5, 65                                    # Q1..Q61


def _sc(col):  # shift a column letter
    n = ci(col)
    return gl(n - 1) if n > DEL else col


LOCAL = re.compile(r"(?<![A-Za-z_!'\]\[$])(\$?)([A-Z]{1,3})(\$?)(\d+)(?![\d(A-Za-z_])")


def shift_local(f):
    return LOCAL.sub(lambda m: f'{m.group(1)}{_sc(m.group(2))}{m.group(3)}{m.group(4)}', f)


def shift_ref(ref):  # 'A1:I62' / 'H2 H5:H9'
    def one(m):
        return _sc(m.group(1)) + m.group(2)
    return re.sub(r'([A-Z]{1,3})(\d+)', one, ref)


def _ext_patterns():
    pats = []
    for s in SHEETS:
        pre = rf"(?:'{s}'|(?<![A-Za-z'_]){s})!"
        pats.append((s, pre))
    return pats


EXT = _ext_patterns()


def shift_external(f):
    """Formulas in OTHER sheets that point to the six forms."""
    for s, pre in EXT:
        # VLOOKUP column index on ranges starting at column A and ending after E
        def vidx(m):
            n = int(m.group(3))
            return m.group(1) + m.group(2) + (str(n - 1) if n > DEL else str(n))
        f = re.sub(rf"({pre}\$A\$\d+:\$[F-Z]\$\d+)(,\s*)(\d+)", vidx, f)

        def rng(m):
            a = f'{m.group(1)}{m.group(2)}{_sc(m.group(3))}{m.group(4)}{m.group(5)}'
            if m.group(7):
                a += f':{m.group(6)}{_sc(m.group(7))}{m.group(8)}{m.group(9)}'
            return a
        f = re.sub(rf"({pre})(\$?)([A-Z]{{1,3}})(\$?)(\d+)(?::(\$?)([A-Z]{{1,3}})(\$?)(\d+))?", rng, f)
    return f


CELL = re.compile(r'<c r="([A-Z]+)(\d+)"([^>]*?)(?:/>|>(.*?)</c>)', re.S)


def delete_column(x):
    # cells
    def cell(m):
        col, row, attrs, inner = m.group(1), m.group(2), m.group(3), m.group(4)
        if ci(col) == DEL:
            return ''
        nc = _sc(col)
        if inner is None:
            return f'<c r="{nc}{row}"{attrs}/>'
        inner = re.sub(r'(<f(?:\s[^>]*)?(?<!/)>)(.*?)(</f>)', lambda k: k.group(1) + html.escape(shift_local(html.unescape(k.group(2))), quote=False) + k.group(3), inner, flags=re.S)
        return f'<c r="{nc}{row}"{attrs}>{inner}</c>'
    x = CELL.sub(cell, x)
    x = re.sub(r'(<row [^>]*?) spans="[^"]*"', r'\1', x)
    # cols
    def cols(m):
        out = []
        for c in re.findall(r'<col [^>]*/>', m.group(1)):
            mn, mx = int(re.search(r'min="(\d+)"', c).group(1)), int(re.search(r'max="(\d+)"', c).group(1))
            if mn == mx == DEL:
                continue
            nmn = mn - 1 if mn > DEL else mn
            nmx = mx if mx == 16384 else (mx - 1 if mx >= DEL else mx)
            c = re.sub(r'min="\d+"', f'min="{nmn}"', c); c = re.sub(r'max="\d+"', f'max="{nmx}"', c)
            out.append(c)
        return '<cols>' + ''.join(out) + '</cols>'
    x = re.sub(r'<cols>(.*?)</cols>', cols, x, flags=re.S)
    for tag, attr in [('dimension', 'ref'), ('autoFilter', 'ref'), ('mergeCell', 'ref'), ('conditionalFormatting', 'sqref'),
                      ('selection', 'sqref'), ('selection', 'activeCell'), ('pane', 'topLeftCell'), ('dataValidation', 'sqref')]:
        x = re.sub(rf'(<{tag} [^>]*?{attr}=")([^"]*)(")', lambda m: m.group(1) + shift_ref(m.group(2)) + m.group(3), x)
    return x


def archive_formula(sheet, label):
    col = ARCH_COL[sheet]
    rg = f"'{ARCH}'!${col}${ARCH_R0}:${col}${ARCH_R1}"
    lab = str(label).strip().upper()
    if lab in ('YES', 'SI', 'SÍ'):
        return f'COUNTIF({rg},"Yes")+COUNTIF({rg},"Si")+COUNTIF({rg},"Sí")'
    if lab == 'NO':
        return f'COUNTIF({rg},"No")'
    return f'COUNTIF({rg},"N/A")'
