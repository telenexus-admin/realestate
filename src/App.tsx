import { useState } from 'react';
import {
  Bell, Building2, CalendarDays, ChevronDown, ChevronRight, CircleDollarSign,
  ClipboardCheck, Command, FileBarChart, Gauge, Home, Inbox, KeyRound, Menu,
  Moon, Plus, Search, Settings, ShieldCheck, Sparkles, Sun, Users, WalletCards,
  Wrench, X, Zap, Landmark, UserRoundCog, Layers3, ReceiptText
} from 'lucide-react';

const navigation = [
  { label: 'Overview', icon: Gauge },
  { heading: 'Portfolio' },
  { label: 'Properties', icon: Building2 },
  { label: 'Units', icon: Layers3 },
  { label: 'Owners', icon: Landmark },
  { label: 'Tenants', icon: Users },
  { label: 'Leasing', icon: KeyRound },
  { heading: 'Finance' },
  { label: 'Collections', icon: WalletCards },
  { label: 'Accounting', icon: ReceiptText },
  { label: 'Arrears', icon: CircleDollarSign, badge: 18 },
  { heading: 'Operations' },
  { label: 'Maintenance', icon: Wrench, badge: 7 },
  { label: 'Inspections', icon: ClipboardCheck },
  { label: 'Inbox', icon: Inbox },
  { heading: 'Intelligence' },
  { label: 'Reports', icon: FileBarChart },
  { label: 'AI Assistant', icon: Sparkles, accent: true },
];

const kpis = [
  { label: 'Portfolio units', value: '742', delta: '+18 this month', hint: 'Across 12 properties' },
  { label: 'Occupancy', value: '91.8%', delta: '+2.4%', hint: '681 occupied units' },
  { label: 'Rent collected', value: 'KES 12.96M', delta: '87.5%', hint: 'of KES 14.82M expected' },
  { label: 'Outstanding', value: 'KES 1.86M', delta: '24 tenants', hint: '18 require attention' },
];

const collection = [64, 69, 66, 74, 77, 81, 79, 85, 88];
const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep'];

const attention = [
  { tone: 'danger', title: '18 tenants overdue >30 days', meta: 'KES 624,000 outstanding', action: 'Review arrears' },
  { tone: 'warning', title: '12 leases expire within 30 days', meta: '8 renewal offers not sent', action: 'Open leasing' },
  { tone: 'amber', title: '7 maintenance tickets overdue', meta: '2 marked urgent', action: 'Review jobs' },
  { tone: 'info', title: '4 inspections awaiting review', meta: 'Move-in and routine inspections', action: 'Open inspections' },
];

const payments = [
  ['Mercy Wanjiku', 'Greenview · A-12', 'KES 32,000', 'M-Pesa', 'Paid'],
  ['Brian Kiptoo', 'Riverside · B-04', 'KES 24,500', 'Bank', 'Paid'],
  ['Alice Njeri', 'Parkline · C-18', 'KES 18,000', 'M-Pesa', 'Partial'],
  ['John Kamau', 'Greenview · B-14', 'KES 36,000', 'M-Pesa', 'Overdue'],
];

function App() {
  const [dark, setDark] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className={dark ? 'app dark' : 'app'}>
      <aside className={mobileOpen ? 'sidebar open' : 'sidebar'}>
        <div className="brand-row">
          <div className="brand-mark"><Building2 size={20}/></div>
          <div><strong>Polyizon</strong><span>PropOS</span></div>
          <button className="icon-button mobile-close" onClick={() => setMobileOpen(false)}><X size={18}/></button>
        </div>

        <div className="workspace-card">
          <div className="workspace-avatar">AP</div>
          <div className="workspace-copy"><strong>Alpha Properties</strong><span>Business workspace</span></div>
          <ChevronDown size={16}/>
        </div>

        <nav>
          {navigation.map((item, i) => item.heading ? (
            <div className="nav-heading" key={i}>{item.heading}</div>
          ) : (
            <button key={item.label} className={`nav-item ${item.label === 'Overview' ? 'active' : ''} ${item.accent ? 'ai' : ''}`}>
              {item.icon && <item.icon size={18}/>}<span>{item.label}</span>
              {item.badge && <em>{item.badge}</em>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="plan-card"><div className="plan-icon"><Zap size={16}/></div><div><strong>Business plan</strong><span>742 / 1,000 units</span></div><ChevronRight size={16}/></div>
          <button className="nav-item"><UserRoundCog size={18}/><span>Team & roles</span></button>
          <button className="nav-item"><Settings size={18}/><span>Settings</span></button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="left-tools"><button className="icon-button menu" onClick={() => setMobileOpen(true)}><Menu size={20}/></button><div className="search"><Search size={18}/><input placeholder="Search properties, tenants, units, payments..."/><kbd>⌘ K</kbd></div></div>
          <div className="top-actions">
            <button className="icon-button" onClick={() => setDark(!dark)}>{dark ? <Sun size={18}/> : <Moon size={18}/>}</button>
            <button className="icon-button notify"><Bell size={18}/><i/></button>
            <button className="add-button"><Plus size={17}/> Add new <ChevronDown size={15}/></button>
            <div className="profile"><div className="profile-avatar">AN</div><div><strong>Alex</strong><span>Company Admin</span></div><ChevronDown size={14}/></div>
          </div>
        </header>

        <section className="content">
          <div className="hero-head">
            <div><div className="eyebrow"><ShieldCheck size={14}/> Portfolio intelligence</div><h1>Good morning, Alex.</h1><p>Here’s what needs your attention across the portfolio today.</p></div>
            <div className="period"><CalendarDays size={16}/> September 2026 <ChevronDown size={14}/></div>
          </div>

          <div className="kpi-grid">
            {kpis.map((kpi, i) => <article className="kpi-card" key={kpi.label}><div className="kpi-top"><span>{kpi.label}</span><div className={`mini-icon i${i}`}><Command size={16}/></div></div><strong>{kpi.value}</strong><div className="kpi-foot"><span className={i === 3 ? 'negative' : ''}>{kpi.delta}</span><small>{kpi.hint}</small></div></article>)}
          </div>

          <div className="dashboard-grid">
            <article className="panel chart-panel">
              <div className="panel-head"><div><span className="panel-kicker">Collection performance</span><h2>Rent collection</h2></div><button>Last 9 months <ChevronDown size={14}/></button></div>
              <div className="chart-summary"><div><strong>KES 12.96M</strong><span>September collected</span></div><div className="rate"><strong>87.5%</strong><span>collection rate</span></div></div>
              <div className="chart-wrap">
                <svg viewBox="0 0 900 260" preserveAspectRatio="none" aria-label="Rent collection trend">
                  <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".22"/><stop offset="100%" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>
                  <path className="gridline" d="M0 40H900 M0 100H900 M0 160H900 M0 220H900"/>
                  <path className="area" d="M0 210 C60 198,70 175,112 179 S180 198,225 188 S295 140,337 146 S405 130,450 121 S520 104,562 112 S635 78,675 86 S750 63,787 70 S860 42,900 50 L900 260 L0 260Z"/>
                  <path className="line" d="M0 210 C60 198,70 175,112 179 S180 198,225 188 S295 140,337 146 S405 130,450 121 S520 104,562 112 S635 78,675 86 S750 63,787 70 S860 42,900 50"/>
                </svg>
                <div className="chart-labels">{months.map((m)=><span key={m}>{m}</span>)}</div>
              </div>
            </article>

            <article className="panel occupancy-panel">
              <div className="panel-head"><div><span className="panel-kicker">Live portfolio</span><h2>Occupancy</h2></div><button className="icon-button"><ChevronRight size={17}/></button></div>
              <div className="donut" style={{background:'conic-gradient(var(--primary) 0 91.8%, var(--amber) 91.8% 97.5%, var(--danger) 97.5% 100%)'}}><div><strong>91.8%</strong><span>occupied</span></div></div>
              <div className="legend"><div><i className="dot primary"/><span>Occupied</span><strong>681</strong></div><div><i className="dot amber"/><span>Vacant</span><strong>42</strong></div><div><i className="dot danger"/><span>Maintenance</span><strong>19</strong></div></div>
            </article>
          </div>

          <div className="dashboard-grid lower">
            <article className="panel attention-panel">
              <div className="panel-head"><div><span className="panel-kicker">Action center</span><h2>Needs attention</h2></div><button>View all</button></div>
              <div className="attention-list">{attention.map(a=><div className="attention-row" key={a.title}><i className={`pulse ${a.tone}`}/><div><strong>{a.title}</strong><span>{a.meta}</span></div><button>{a.action}<ChevronRight size={14}/></button></div>)}</div>
            </article>

            <article className="panel activity-panel">
              <div className="panel-head"><div><span className="panel-kicker">Transactions</span><h2>Recent payments</h2></div><button>View ledger</button></div>
              <div className="payment-list">{payments.map(p=><div className="payment-row" key={p[0]}><div className="tenant-avatar">{p[0].split(' ').map(x=>x[0]).join('').slice(0,2)}</div><div className="payment-person"><strong>{p[0]}</strong><span>{p[1]}</span></div><div className="payment-amount"><strong>{p[2]}</strong><span>{p[3]}</span></div><b className={`status ${p[4].toLowerCase()}`}>{p[4]}</b></div>)}</div>
            </article>
          </div>
        </section>
      </main>
      {mobileOpen && <button className="scrim" onClick={() => setMobileOpen(false)} aria-label="Close menu"/>}
    </div>
  );
}

export default App;
