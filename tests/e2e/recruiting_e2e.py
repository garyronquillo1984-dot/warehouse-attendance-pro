"""End-to-end test of the recruiting module in a real browser against the local stack.

Covers: owner signs in -> recruiting defaults appear -> privacy contact -> pre-registration form
and QR kit -> a candidate registers anonymously in Spanish on a phone -> the candidate appears,
contact is logged, a message is prepared, the stage moves, the person is hired onto the roster ->
first attendance moves them to "started" -> openings, 90-day plan, agency log, reports ->
sample data in and out. Screenshots of every screen are saved for review.
Run with tests/e2e/run_recruiting.sh.
"""
import asyncio, json, os, subprocess, sys, urllib.request
from playwright.async_api import async_playwright, expect

BASE = 'http://localhost:5173'
API = 'http://localhost:54321'
SHOTS = sys.argv[1] if len(sys.argv) > 1 else 'screenshots'
os.makedirs(SHOTS, exist_ok=True)
OWNER, PW = 'recruiter@example.com', 'Recruit-Florence-2026!'
passed, failed = [], []
PAGES = []

def check(name, cond, detail=''):
    (passed if cond else failed).append(name + (f' — {detail}' if detail and not cond else ''))

def psql(sql):
    r = subprocess.run(['psql', '-h', '/tmp', '-p', '54329', '-U', 'postgres', '-d', 'wap_e2e', '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', sql],
                       capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr)
    return r.stdout.strip()

def key(role):
    env = dict(os.environ, LS_JWT_SECRET='local-dev-only-jwt-secret-0123456789abcdef')
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return subprocess.run(['node', f'{root}/scripts/localstack/keys.mjs', role], capture_output=True, text=True, env=env).stdout.strip()

def call(path, body, token=None, method='POST', apikey=None):
    req = urllib.request.Request(API + path, data=json.dumps(body).encode(), method=method,
                                 headers={'Content-Type': 'application/json', 'apikey': apikey or key('anon'),
                                          'Authorization': f'Bearer {token or apikey or key("anon")}', 'Prefer': 'return=representation'})
    with urllib.request.urlopen(req) as r:
        txt = r.read().decode()
        return json.loads(txt) if txt else None

async def shot(page, name):
    await page.wait_for_timeout(250)
    await page.screenshot(path=f'{SHOTS}/{name}.png', full_page=True)

async def main():
    # A purchase, a confirmed account, a company with one warehouse and one shift.
    psql("select billing.apply_hotmart_event('rec-e2e-1','PURCHASE_APPROVED', now(), 'SUB-REC', null, "
         f"'{OWNER}', 'professional', now() + interval '30 days')")
    call('/auth/v1/admin/users', {'email': OWNER, 'password': PW, 'email_confirm': True, 'user_metadata': {'full_name': 'Gary R.'}}, apikey=key('service_role'))
    tok = call('/auth/v1/token?grant_type=password', {'email': OWNER, 'password': PW})['access_token']
    org = call('/rest/v1/rpc/claim_license', {'org_name': 'Florence Staffing Team'}, token=tok)
    wh = call('/rest/v1/warehouses', {'organization_id': org, 'name': 'Win.It Florence'}, token=tok)[0]['id']
    call('/rest/v1/shifts', {'organization_id': org, 'warehouse_id': wh, 'name': 'First Shift', 'start_time': '06:00', 'end_time': '14:30'}, token=tok)

    async with async_playwright() as p:
        try:
            browser = await p.chromium.launch()
            ctx = await browser.new_context(viewport={'width': 1280, 'height': 900})
            await ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin=BASE)
            page = await ctx.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            PAGES.append(page)

            await page.goto(f'{BASE}/login')
            await page.get_by_label('Email').fill(OWNER)
            await page.get_by_label('Password').fill(PW)
            await page.get_by_role('button', name='Sign in').click()
            await expect(page.get_by_role('heading', name='Today')).to_be_visible()

            # Recruiting opens with defaults created for the owner.
            await page.get_by_role('link', name='Recruiting').first.click()
            await expect(page.get_by_role('heading', name='Recruiting dashboard')).to_be_visible()
            check('defaults seeded: 16 sources', psql(f"select count(*) from recruitment_sources where organization_id = '{org}'") == '16')
            check('defaults seeded: bilingual templates', psql(f"select count(*) from message_templates where organization_id = '{org}' and lang = 'es'") == psql(f"select count(*) from message_templates where organization_id = '{org}' and lang = 'en'"))
            await shot(page, 'r01-dashboard-empty')

            # Language toggle.
            await page.get_by_role('button', name='ES', exact=True).click()
            await expect(page.get_by_role('heading', name='Panel de reclutamiento')).to_be_visible()
            check('Spanish interface', True)
            await page.get_by_role('button', name='EN', exact=True).click()

            # Settings: privacy contact.
            await page.get_by_role('link', name='Settings', exact=True).nth(1).click()
            await page.get_by_label('Name shown to candidates').fill('Florence Staffing Team')
            await page.get_by_label('Privacy contact (email or phone for data requests)').fill('privacy@example.com')
            await page.get_by_role('button', name='Save settings').click()
            await expect(page.get_by_text('Saved.')).to_be_visible()
            await shot(page, 'r02-settings')

            # Opening.
            await page.get_by_role('link', name='Openings').click()
            await page.get_by_role('button', name='Add opening').click()
            await page.get_by_label('Title').fill('Picker / Packer – First shift')
            await page.get_by_label('People needed').fill('5')
            await page.get_by_label('Status').select_option('authorized')
            await page.get_by_role('button', name='Save').click()
            await expect(page.get_by_text('An authorized opening needs who authorized it and when.')).to_be_visible()
            check('authorized opening requires who and when', True)
            await page.get_by_label('Authorized by (name / role)').fill('Site manager (verbal, to confirm in writing)')
            await page.get_by_label('Authorized on').fill('2026-10-26')
            await page.get_by_role('button', name='Save').click()
            await expect(page.get_by_role('cell', name='Picker / Packer – First shift')).to_be_visible()
            await shot(page, 'r03-openings')

            # Pre-registration form + kit.
            await page.get_by_role('link', name='Sources & QR').click()
            await page.get_by_label('Form name (shown on the form)').fill('Warehouse jobs – Florence, KY')
            await page.locator('#nf-src').select_option(label='Flyer / QR code')
            await page.get_by_role('button', name='Create form').click()
            await expect(page.get_by_text('Warehouse jobs – Florence, KY')).to_be_visible()
            token = psql(f"select token from intake_forms where organization_id = '{org}'")
            await shot(page, 'r04-sources')
            await page.get_by_role('button', name='QR, flyer and card').click()
            await expect(page.get_by_alt_text(f'QR code: {BASE}/apply/{token}')).to_be_visible()
            await shot(page, 'r05-kit')

            # Anonymous candidate on a phone, in Spanish.
            anon = await browser.new_context(viewport={'width': 390, 'height': 844}, locale='es-US')
            ap = await anon.new_page()
            ap.on('pageerror', lambda e: errors.append(str(e)))
            await ap.goto(f'{BASE}/apply/{token}')
            await expect(ap.get_by_role('heading', name='Warehouse jobs – Florence, KY')).to_be_visible()
            await expect(ap.get_by_text('Registrarte no garantiza empleo', exact=False).first).to_be_visible()
            await shot(ap, 'r06-apply-phone-es')
            await ap.get_by_label('Nombre', exact=True).fill('Lucía')
            await ap.get_by_label('Apellido').fill('Hernández')
            await ap.get_by_label('Teléfono celular').fill('(859) 555-0123')
            await ap.get_by_label('Código postal').fill('41042')
            await ap.get_by_role('button', name='1er turno (día)').click()
            await ap.get_by_role('button', name='Empaque').first.click()
            await ap.get_by_role('button', name='Escáner RF').first.click()
            await ap.get_by_role('button', name='Enviar registro').click()
            await expect(ap.get_by_text('Necesitamos tu permiso para contactarte sobre empleos.')).to_be_visible()
            check('form refuses without consent', True)
            await ap.get_by_text('Acepto que Florence Staffing Team me contacte', exact=False).click()
            await ap.get_by_text('Pueden enviarme mensajes de texto', exact=False).click()
            await ap.get_by_role('button', name='Enviar registro').click()
            await expect(ap.get_by_role('heading', name='¡Gracias! Recibimos tu registro.')).to_be_visible()
            await shot(ap, 'r07-apply-done')
            row = psql(f"select phone || '|' || preferred_language || '|' || stage || '|' || consent_sms from candidates where organization_id = '{org}'")
            check('anonymous registration stored, normalized, in Spanish, with SMS consent', row == '8595550123|es|new|true', row)
            await anon.close()

            # The recruiter works the candidate.
            await page.get_by_role('link', name='Candidates').click()
            await page.get_by_role('link', name='Lucía Hernández').click()
            await expect(page.get_by_role('heading', name='Lucía Hernández')).to_be_visible()
            await page.locator('#ek').select_option('call')
            await page.locator('#eo').select_option('reached')
            await page.locator('#eb').fill('Interested in packing, first shift')
            await page.get_by_role('button', name='Save', exact=True).click()
            await expect(page.get_by_text('Contacted').first).to_be_visible()
            check('logging a reached call moves the stage to contacted', psql(f"select stage from candidates where organization_id = '{org}'") == 'contacted')
            # Message: Spanish template for a Spanish speaker.
            await page.get_by_label('My name').fill('Gary')
            await page.get_by_label('My work phone').fill('(859) 555-0100')
            preview = await page.locator('.message-preview').first.inner_text()
            check('message prepared in the candidate’s language with her name', 'Hola Lucía' in preview and 'Gary' in preview, preview[:80])
            await page.locator('#stage').select_option('approved')
            await page.get_by_role('button', name='Update stage').click()
            await expect(page.get_by_role('heading', name='Add to the employee roster')).to_be_visible()
            await shot(page, 'r08-candidate')
            await page.get_by_label('Badge ID').fill('7001')
            await page.get_by_role('button', name='Add to roster').click()
            await expect(page.get_by_text('Hired: linked to the employee roster.', exact=False)).to_be_visible()
            emp = psql(f"select employee_id from candidates where organization_id = '{org}'")
            check('hire creates the employee and links the candidate', len(emp) == 36)
            psql(f"insert into attendance_records (employee_id, organization_id, warehouse_id, work_date, status) values ('{emp}', '{org}', '{wh}', current_date, 'present')")
            check('first attendance moves the candidate to started', psql(f"select stage from candidates where organization_id = '{org}'") == 'started')

            # Tasks, pipeline, calendar, agencies, report.
            await page.get_by_role('link', name='Tasks').click()
            await expect(page.get_by_text('Day-7 check-in: Lucía Hernández')).to_be_visible()
            await shot(page, 'r09-tasks')
            await page.get_by_role('link', name='Pipeline').click()
            await expect(page.get_by_role('heading', name='Authorized to work')).to_be_visible()
            await page.get_by_role('link', name='Calendar').click()
            await page.get_by_role('button', name='Load suggested 90-day plan').click()
            await expect(page.get_by_text('Weekly agency coordination meeting', exact=False).first).to_be_visible()
            check('90-day plan loaded, nothing marked confirmed',
                  psql(f"select count(*) filter (where status = 'confirmed') || '/' || count(*) from recruitment_activities where organization_id = '{org}'") == '0/39')
            await shot(page, 'r10-calendar')
            await page.get_by_role('link', name='Agencies').click()
            await page.get_by_role('button', name='Add entry').click()
            await page.locator('#e-title').fill('Intro meeting with agency representatives')
            await page.get_by_role('button', name='Save').click()
            await expect(page.get_by_text('Intro meeting with agency representatives', exact=True)).to_be_visible()
            agenda = await page.locator('.message-preview').first.inner_text()
            check('agency agenda has openings but no candidate names', 'Picker / Packer' in agenda and 'Lucía' not in agenda)
            await shot(page, 'r11-agencies')
            await page.locator('.subnav').get_by_role('link', name='Reports').click()
            await expect(page.get_by_role('heading', name='Daily recruiting report')).to_be_visible()
            report = await page.locator('.message-preview').inner_text()
            check('daily report counts today’s registration and contact', '• New registrations: 1' in report and '• People contacted: 1' in report, report[:300])
            check('report has no personal data', 'Lucía' not in report and '555' not in report)
            await shot(page, 'r12-report')

            # Exports are recorded.
            await page.get_by_role('link', name='Candidates').click()
            async with page.expect_download() as dl:
                await page.get_by_role('button', name='CSV').click()
            check('candidate CSV downloaded', (await dl.value).suggested_filename.endswith('.csv'))
            check('export recorded in the audit log', psql(f"select count(*) from audit_log where organization_id = '{org}' and action = 'export'") == '1')

            # Sample data.
            await page.get_by_role('link', name='Dashboard').click()
            await expect(page.get_by_role('heading', name='Recruiting dashboard')).to_be_visible()
            check('no sample banner with real data only', await page.get_by_text('Sample data is loaded.').count() == 0)
            uid = psql(f"select id from auth.users where email = '{OWNER}'")
            psql(f"""select set_config('request.jwt.claims', '{{"sub":"{uid}"}}', false); select public.load_recruitment_samples('{org}', '{wh}')""")
            await page.reload()
            await expect(page.get_by_text('Sample data is loaded.')).to_be_visible()
            await shot(page, 'r13-dashboard-samples')
            await page.get_by_role('link', name='Pipeline').click()
            await shot(page, 'r14-pipeline-samples')
            await page.get_by_role('link', name='Dashboard').click()
            await page.get_by_role('button', name='Remove sample data').click()
            await page.wait_for_load_state('networkidle')
            check('samples removed, real candidate kept', psql(f"select count(*) from candidates where organization_id = '{org}'") == '1')

            # Phone layout of the candidate list.
            phone = await browser.new_context(viewport={'width': 390, 'height': 844})
            pp = await phone.new_page()
            await pp.goto(f'{BASE}/login')
            await pp.get_by_label('Email').fill(OWNER)
            await pp.get_by_label('Password').fill(PW)
            await pp.get_by_role('button', name='Sign in').click()
            await expect(pp.get_by_role('heading', name='Today')).to_be_visible()
            await pp.goto(f'{BASE}/recruiting/candidates')
            await expect(pp.get_by_role('link', name='Lucía Hernández')).to_be_visible()
            width = await pp.evaluate('document.documentElement.scrollWidth')
            check('no horizontal scroll on a phone', width <= 390, f'scrollWidth {width}')
            await shot(pp, 'r15-candidates-phone')

            check('no JavaScript errors', not errors, '; '.join(errors))
            await browser.close()
        except Exception:
            for n, pg in enumerate(PAGES):
                await pg.screenshot(path=f'{SHOTS}/FAIL-{n}.png', full_page=True)
            raise


try:
    asyncio.run(main())
except Exception as e:   # keep going to the summary, with the failing step named
    failed.append('HARNESS: ' + ' | '.join(str(e).splitlines()[:6]))
print(f'\n{len(passed)} passed, {len(failed)} failed')
for f in failed:
    print(' ✗ ' + f)
sys.exit(1 if failed else 0)
