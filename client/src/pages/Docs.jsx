import { Link } from 'react-router-dom';
import {
  ArrowLeft, Path, Pulse, BellRinging, ChartLine, Warning,
  GithubLogo, Plus, ArrowRight,
} from '@phosphor-icons/react';
import { GITHUB_URL } from '../config';
import BuiltBy from '../components/BuiltBy';

const STEPS = [
  {
    icon: <Plus size={20} weight="bold" />,
    title: 'You add a monitor',
    body: 'Give UPTIME_MONITOR a name, a URL, an HTTP method, the status code you expect, a timeout, and how often to check. That is the whole contract.',
  },
  {
    icon: <Pulse size={20} weight="bold" />,
    title: 'The scheduler probes it',
    body: 'A node-cron tick fans out over every due monitor in parallel. Each probe records the status code, response time, and any error — one failing endpoint never blocks the others.',
  },
  {
    icon: <Path size={20} weight="bold" />,
    title: 'A debounced state machine decides UP or DOWN',
    body: 'A single failure is not an outage. A monitor only flips to DOWN after a streak of consecutive failures (the failure threshold), which kills false alarms from a blip.',
  },
  {
    icon: <Warning size={20} weight="bold" />,
    title: 'Incidents open and close',
    body: 'The moment a monitor goes DOWN, an incident opens with a start time. When it recovers, the incident closes and the total downtime is computed for you.',
  },
  {
    icon: <BellRinging size={20} weight="bold" />,
    title: 'You get notified',
    body: 'Enable notifications and UPTIME_MONITOR fires a system alert when a monitor goes down, when it recovers, and when the API itself becomes unreachable — even while you are in another app.',
  },
  {
    icon: <ChartLine size={20} weight="bold" />,
    title: 'You watch the trend',
    body: 'Every check is stored, so each monitor has a latency chart (1h / 24h / 7d / 30d), a rolling uptime percentage, and a full incident history.',
  },
];

const FAQ = [
  {
    q: 'How often is my site checked?',
    a: 'On the interval you set per monitor (minimum 30 seconds). You can also press “Check now” to probe instantly, off-schedule.',
  },
  {
    q: 'Why did my site not alert on a single hiccup?',
    a: 'By design. A monitor must fail several checks in a row before it is considered DOWN. This debounce is what separates a useful monitor from an alert-spam machine.',
  },
  {
    q: 'What counts as “down”?',
    a: 'A request that times out, cannot connect, or returns a status code other than the one you marked as expected.',
  },
  {
    q: 'Do notifications work when the tab is in the background?',
    a: 'Yes. As long as the browser is running, alerts are delivered through the service worker — you do not need the UPTIME_MONITOR tab focused.',
  },
];

function StatusLegend() {
  return (
    <div className="legend">
      <span className="pill up"><span className="tick" />UP — responding as expected</span>
      <span className="pill down"><span className="tick" />DOWN — failing past the threshold</span>
      <span className="pill pending"><span className="tick" />PENDING — awaiting first result</span>
      <span className="pill paused"><span className="tick" />PAUSED — checks suspended</span>
    </div>
  );
}

export default function Docs() {
  return (
    <div className="container docs">
      <Link to="/" className="back-link"><ArrowLeft size={15} weight="bold" /> Back to dashboard</Link>

      <header className="docs-hero">
        <span className="eyebrow">Documentation</span>
        <h1 className="display">How UPTIME_MONITOR<br />watches your sites.</h1>
        <p className="lede">
          UPTIME_MONITOR is the night watch for your stack. Ruthless schedule,
          smart debounce, loud only when something is actually on fire — so you
          hear about downtime before your users ever do.
        </p>
      </header>

      <section className="docs-section">
        <h2 className="docs-h2">The monitoring loop</h2>
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li className="step" key={s.title}>
              <span className="step-num">{i + 1}</span>
              <span className="step-icon">{s.icon}</span>
              <div className="step-body">
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Reading a status</h2>
        <StatusLegend />
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Good to know</h2>
        <div className="faq">
          {FAQ.map((f) => (
            <div className="faq-item" key={f.q}>
              <h3>{f.q}</h3>
              <p>{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="docs-cta">
        <div>
          <h2 className="docs-h2">Ready to watch something?</h2>
          <p className="muted">Add your first endpoint — UPTIME_MONITOR starts probing it immediately.</p>
        </div>
        <div className="docs-cta-actions">
          <Link className="btn primary" to="/">Open the dashboard <ArrowRight size={16} weight="bold" /></Link>
          <Link className="btn ghost" to="/signup">Create an account</Link>
          <a className="btn ghost" href={GITHUB_URL} target="_blank" rel="noreferrer noopener">
            <GithubLogo size={16} weight="bold" /> View source
          </a>
        </div>
      </section>

      <div className="docs-credit">
        <BuiltBy />
        <span className="docs-credit-note">Designed &amp; built end to end.</span>
      </div>
    </div>
  );
}
