import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Wordmark } from '../components/ui';
import { SUPPORT_EMAIL } from '../lib/setup';

// Who runs the service. Change here if the business name changes.
const OPERATOR = 'Intercomercio';
const UPDATED = 'October 7, 2026';
const CONTACT = SUPPORT_EMAIL || 'the support email shown in the app';

function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="legal">
      <header className="legal-head">
        <Wordmark to="/" />
        <nav className="row small"><Link to="/terms">Terms</Link><Link to="/privacy">Privacy</Link></nav>
      </header>
      <main className="legal-body">
        <h1>{title}</h1>
        <p className="muted">Last updated {UPDATED}</p>
        {children}
      </main>
    </div>
  );
}

export function Terms() {
  return (
    <LegalPage title="Terms of Service">
      <p>These terms apply to Warehouse Attendance Pro (“the service”), operated by {OPERATOR} (“we”, “us”). By creating an
        account or using the service you agree to them. If you use it for a company, you confirm you may accept these terms for that company.</p>

      <h2>1. What the service does</h2>
      <p>A web application to record and report warehouse attendance by shift: employees, shifts, daily attendance,
        absence reasons, reports and downloads. Features can change as the product improves; we won’t remove a core
        feature you pay for without notice.</p>

      <h2>2. Accounts</h2>
      <ul>
        <li>You must be at least 18 and give a real email address. Each person uses their own account.</li>
        <li>Keep your password private. You are responsible for what happens under your account and for the people you invite.</li>
        <li>Tell us right away at {CONTACT} if you think someone else has access to your account.</li>
      </ul>

      <h2>3. Subscription, payment and refunds</h2>
      <ul>
        <li>Plans are sold through Hotmart, which processes the payment. Prices and billing periods are shown at checkout.</li>
        <li>Subscriptions renew automatically until you cancel them in Hotmart. When you cancel, you keep access until the end of the period you paid for.</li>
        <li>Refund requests follow the guarantee period shown on the Hotmart offer and are handled through Hotmart. A refund or chargeback ends access.</li>
        <li>If a payment fails we may give a short grace period and then suspend access until it is paid.</li>
      </ul>

      <h2>4. Your data</h2>
      <ul>
        <li>The information you enter (company, employees, attendance) belongs to you. We use it only to provide the service. See the <Link to="/privacy">Privacy Policy</Link>.</li>
        <li>You confirm you are allowed to enter your employees’ information and that you follow the employment and privacy laws that apply to you.</li>
        <li>Do not enter medical details or other sensitive personal information. Absence reasons are general categories on purpose.</li>
        <li>After your subscription ends we keep your company’s data for at least 30 days so you can renew or ask us for an export.</li>
      </ul>

      <h2>5. Acceptable use</h2>
      <p>Don’t use the service for anything illegal, try to access another company’s data or our systems, overload or
        disrupt the service, resell it, or copy it. We may suspend accounts that do.</p>

      <h2>6. Availability</h2>
      <p>We work to keep the service available and your data safe, but we can’t promise it will always be uninterrupted or
        error-free. We may pause it briefly for maintenance.</p>

      <h2>7. No professional advice</h2>
      <p>The service is a record-keeping tool. Reports reflect what your team enters. Check the information before using it for
        payroll, discipline or legal decisions.</p>

      <h2>8. Liability</h2>
      <p>The service is provided “as is”. To the extent the law allows, we are not liable for indirect or consequential losses,
        and our total liability for any claim is limited to what you paid us in the 12 months before the claim.</p>

      <h2>9. Ending the service</h2>
      <p>You can stop at any time by cancelling your subscription. We may suspend or end access for non-payment or a serious
        breach of these terms, and we will tell you why.</p>

      <h2>10. Changes</h2>
      <p>We may update these terms. If a change is important we will tell you by email or in the app before it applies.</p>

      <h2>11. Law</h2>
      <p>These terms are governed by the laws of the State of Ohio, United States.</p>

      <h2>12. Contact</h2>
      <p>{CONTACT}</p>
    </LegalPage>
  );
}

export function Privacy() {
  return (
    <LegalPage title="Privacy Policy">
      <p>This policy explains what information Warehouse Attendance Pro, operated by {OPERATOR}, keeps and why.
        Questions: {CONTACT}.</p>

      <h2>What we keep</h2>
      <ul>
        <li><strong>Your account:</strong> name, email and password. Passwords are stored only as a secure hash by our sign-in provider.</li>
        <li><strong>Your company:</strong> company name, time zone, warehouses, shifts, departments and your team members’ roles.</li>
        <li><strong>Employee records you enter:</strong> badge ID, first and last name, shift, department, hire date, status, and
          attendance (status, absence reason category, short note). We ask you not to enter medical or other sensitive details.</li>
        <li><strong>Purchase information from Hotmart:</strong> buyer email, plan, and purchase and subscription codes. We don’t
          receive or keep card numbers. Phone numbers, ID documents and addresses that Hotmart may send are discarded.</li>
        <li><strong>Technical information:</strong> a sign-in session stored in your browser, and server logs kept by our
          providers (such as IP address and time of a request) for security.</li>
        <li><strong>Change history:</strong> who added, changed or removed employees and attendance, and when.</li>
      </ul>

      <h2>How we use it</h2>
      <p>Only to run the service: sign you in, show and save your data, enforce your plan, keep accounts secure, and answer
        support requests. We don’t sell personal information and we don’t use it for advertising.</p>

      <h2>Your role and ours</h2>
      <p>For your employees’ information, your company decides what is entered and why; we process it on your behalf and
        follow your instructions. You are responsible for informing your employees as your local law requires.</p>

      <h2>Who helps us run the service</h2>
      <ul>
        <li><strong>Supabase:</strong> database and sign-in. Data is stored in the United States.</li>
        <li><strong>Cloudflare:</strong> hosting of the web app.</li>
        <li><strong>Hotmart:</strong> checkout, payments and subscriptions.</li>
        <li><strong>Email delivery provider:</strong> account emails such as confirmations and password resets.</li>
      </ul>
      <p>They only receive what they need to provide their part of the service.</p>

      <h2>Who can see your data</h2>
      <p>Only the people in your company, according to the role you give them. Each company’s data is separated inside the
        database itself. Our administration panel shows account and billing information, not your employees or attendance.
        We access your data only when you ask us to for support, or when the law requires it.</p>

      <h2>How long we keep it</h2>
      <ul>
        <li>While your subscription is active.</li>
        <li>For at least 30 days after it ends, so you can renew or ask for an export. After that we delete your company’s
          data within 90 days, unless the law requires us to keep it or you ask us to keep it longer.</li>
        <li>Demo companies are deleted after 24 hours.</li>
      </ul>

      <h2>Security</h2>
      <p>Connections are encrypted, each company is isolated, access is limited by role, and two-step sign-in is available.
        No system is perfectly secure; if a breach affects your information we will tell you without undue delay.</p>

      <h2>Your choices and rights</h2>
      <p>You can view and correct your information in the app. To get a copy, or to delete your account or your company’s
        data, email {CONTACT}. Depending on where you live you may have additional rights; we will honor them.</p>

      <h2>Browser storage</h2>
      <p>We use your browser’s storage only to keep you signed in and remember choices such as the last warehouse you used.
        No advertising or tracking cookies.</p>

      <h2>Children</h2>
      <p>The service is for businesses and is not meant for anyone under 18.</p>

      <h2>Changes</h2>
      <p>If we change this policy in an important way we will tell you by email or in the app.</p>
    </LegalPage>
  );
}
