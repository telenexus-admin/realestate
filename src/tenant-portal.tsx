import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Download,
  FileText,
  Home,
  LayoutDashboard,
  Landmark,
  LoaderCircle,
  LogOut,
  Menu,
  MessageSquarePlus,
  ReceiptText,
  RefreshCw,
  Send,
  Smartphone,
  WalletCards,
  X,
} from "lucide-react";
import {
  api,
  type Session,
  type TenantPaymentOptions,
  type TenantPortalData,
} from "./api";
import "./tenant-portal.css";

type Tab = "dashboard" | "payments" | "documents" | "tickets";
const cash = (value: unknown) =>
  `KES ${Number(value || 0).toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;
const day = (value: unknown) =>
  value
    ? new Date(String(value)).toLocaleDateString("en-KE", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
const title = (value: unknown) =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function TenantPortal({
  session,
  onLogout,
}: {
  session: Session;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<Tab>("dashboard"),
    [menu, setMenu] = useState(false),
    [data, setData] = useState<TenantPortalData | null>(null),
    [paymentOptions, setPaymentOptions] = useState<TenantPaymentOptions | null>(
      null,
    ),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [form, setForm] = useState({
      category: "maintenance",
      priority: "normal",
      subject: "",
      description: "",
    }),
    [sending, setSending] = useState(false),
    [sent, setSent] = useState(false);
  const [payForm, setPayForm] = useState<{
      mode: "overdue" | "months";
      months: number;
      phone: string;
    }>({ mode: "overdue", months: 1, phone: "" }),
    [paymentBusy, setPaymentBusy] = useState(false),
    [paymentRequest, setPaymentRequest] = useState<any>(null);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const [portal, options] = await Promise.all([
        api.tenantPortal(),
        api.tenantPaymentOptions(),
      ]);
      setData(portal);
      setPaymentOptions(options);
      setPayForm((current) => ({
        ...current,
        phone: current.phone || options.phone || "",
      }));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load your portal",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (
      !paymentRequest?.id ||
      !["initiated", "queued"].includes(paymentRequest.status)
    )
      return;
    const timer = window.setInterval(() => {
      api
        .tenantPaymentStatus(paymentRequest.id)
        .then((next) => {
          setPaymentRequest(next);
          if (next.status === "paid") {
            window.clearInterval(timer);
            void load();
          }
          if (next.status === "failed") window.clearInterval(timer);
        })
        .catch(() => {});
    }, 3000);
    return () => window.clearInterval(timer);
  }, [paymentRequest?.id, paymentRequest?.status]);
  const navigate = (next: Tab) => {
    setTab(next);
    setMenu(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const nextBill = useMemo(
    () =>
      data?.invoices.find(
        (item) => Number(item.total || 0) > Number(item.paid_amount || 0),
      ),
    [data],
  );
  const initials = session.user.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  async function submitTicket(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setError("");
    try {
      await api.createTenantTicket(form);
      setForm({
        category: "maintenance",
        priority: "normal",
        subject: "",
        description: "",
      });
      setSent(true);
      await load();
      setTab("tickets");
      window.setTimeout(() => setSent(false), 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not send your ticket",
      );
    } finally {
      setSending(false);
    }
  }
  async function startPayment(event: FormEvent) {
    event.preventDefault();
    setPaymentBusy(true);
    setError("");
    try {
      const started = await api.initiateTenantPayment(payForm);
      setPaymentRequest({
        id: started.requestId,
        status: started.status,
        amount: started.amount,
        result_description: started.customerMessage,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start payment");
    } finally {
      setPaymentBusy(false);
    }
  }
  const tabs: [Tab, string, typeof LayoutDashboard][] = [
    ["dashboard", "Dashboard", LayoutDashboard],
    ["payments", "Payments", WalletCards],
    ["documents", "Documents", FileText],
    ["tickets", "Tickets", MessageSquarePlus],
  ];
  return (
    <div className="tenant-portal-shell">
      <aside className={menu ? "tp-sidebar open" : "tp-sidebar"}>
        <div className="tp-brand">
          <span>
            <Building2 size={20} />
          </span>
          <div>
            <strong>Polyizon</strong>
            <small>Tenant Portal</small>
          </div>
          <button onClick={() => setMenu(false)}>
            <X size={18} />
          </button>
        </div>
        <div className="tp-home-card">
          <Home size={17} />
          <div>
            <small>MY HOME</small>
            <strong>{data?.tenant?.property_name || "Your property"}</strong>
            <span>
              {data?.tenant?.unit_number
                ? `Unit ${data.tenant.unit_number}`
                : "Home details pending"}
            </span>
          </div>
        </div>
        <nav>
          {tabs.map(([key, label, Icon]) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => navigate(key)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {key === "tickets" &&
              data?.tickets.filter(
                (ticket) => !["resolved", "closed"].includes(ticket.status),
              ).length ? (
                <em>
                  {
                    data.tickets.filter(
                      (ticket) =>
                        !["resolved", "closed"].includes(ticket.status),
                    ).length
                  }
                </em>
              ) : null}
            </button>
          ))}
        </nav>
        <button
          className="tp-logout"
          onClick={async () => {
            await api.logout();
            onLogout();
          }}
        >
          <LogOut size={17} /> Sign out
        </button>
      </aside>
      {menu && <button className="tp-scrim" onClick={() => setMenu(false)} />}
      <main className="tp-main">
        <header>
          <button className="tp-menu" onClick={() => setMenu(true)}>
            <Menu size={20} />
          </button>
          <div>
            <small>Welcome home</small>
            <strong>{session.user.name}</strong>
          </div>
          <span className="tp-avatar">{initials}</span>
        </header>
        <section className="tp-content">
          {loading && !data ? (
            <div className="tp-loading">
              <RefreshCw size={24} />
              <strong>Loading your home…</strong>
            </div>
          ) : error && !data ? (
            <div className="tp-error">
              <AlertCircle size={22} />
              <strong>We could not open your portal</strong>
              <span>{error}</span>
              <button onClick={load}>Try again</button>
            </div>
          ) : (
            data && (
              <>
                {tab === "dashboard" && (
                  <div className="tp-page">
                    <div className="tp-welcome">
                      <div>
                        <span>TENANT DASHBOARD</span>
                        <h1>Hello, {data.tenant.first_name}</h1>
                        <p>
                          Your rent, receipts, documents and support are
                          together here.
                        </p>
                      </div>
                      <div className="tp-home">
                        <Home size={22} />
                        <span>
                          <small>CURRENT HOME</small>
                          <strong>
                            {data.tenant.property_name || "Not assigned"}
                          </strong>
                          <em>
                            {data.tenant.unit_number
                              ? `Unit ${data.tenant.unit_number}`
                              : "Unit pending"}
                          </em>
                        </span>
                      </div>
                    </div>
                    <div className="tp-stats">
                      <article className={data.balance > 0 ? "due" : "clear"}>
                        <span>
                          <CircleDollarSign size={18} /> Current balance
                        </span>
                        <strong>{cash(data.balance)}</strong>
                        <small>
                          {data.balance > 0
                            ? "Payment is still due"
                            : "You are up to date"}
                        </small>
                      </article>
                      <article>
                        <span>
                          <CalendarDays size={18} /> Next due date
                        </span>
                        <strong>
                          {nextBill ? day(nextBill.due_date) : "No bill due"}
                        </strong>
                        <small>
                          {nextBill
                            ? nextBill.invoice_number
                            : "Nothing pending"}
                        </small>
                      </article>
                      <article>
                        <span>
                          <ReceiptText size={18} /> Last payment
                        </span>
                        <strong>
                          {data.payments[0]
                            ? cash(data.payments[0].amount)
                            : "No payments yet"}
                        </strong>
                        <small>
                          {data.payments[0]
                            ? day(data.payments[0].paid_at)
                            : "Payments will appear here"}
                        </small>
                      </article>
                    </div>
                    <div className="tp-dashboard-grid">
                      <section className="tp-panel">
                        <div className="tp-panel-head">
                          <div>
                            <span>RECENT PAYMENTS</span>
                            <h2>Your latest receipts</h2>
                          </div>
                          <button onClick={() => navigate("payments")}>
                            View all
                          </button>
                        </div>
                        {data.payments.slice(0, 3).map((payment) => (
                          <div className="tp-row" key={payment.id}>
                            <span className="tp-row-icon success">
                              <CheckCircle2 size={17} />
                            </span>
                            <div>
                              <strong>{payment.reference}</strong>
                              <small>
                                {title(payment.payment_method)} ·{" "}
                                {day(payment.paid_at)}
                              </small>
                            </div>
                            <b>{cash(payment.amount)}</b>
                          </div>
                        ))}
                        {!data.payments.length && (
                          <Empty
                            icon={ReceiptText}
                            title="No payments yet"
                            text="Your confirmed payments will appear here."
                          />
                        )}
                      </section>
                      <section className="tp-panel">
                        <div className="tp-panel-head">
                          <div>
                            <span>SUPPORT</span>
                            <h2>Need help?</h2>
                          </div>
                        </div>
                        <div className="tp-help">
                          <MessageSquarePlus size={26} />
                          <strong>Tell the property team</strong>
                          <p>
                            Raise a ticket for repairs, water, payments or
                            another concern.
                          </p>
                          <button onClick={() => navigate("tickets")}>
                            Raise a ticket
                          </button>
                        </div>
                      </section>
                    </div>
                  </div>
                )}
                {tab === "payments" && (
                  <div className="tp-page">
                    <PageHead
                      kicker="PAYMENTS"
                      title="Payments and receipts"
                      text="Every confirmed payment made on your account."
                    />
                    <section className="tp-pay-online">
                      <div className="tp-pay-copy">
                        <span>
                          <Landmark size={20} />
                        </span>
                        <div>
                          <small>PAY RENT ONLINE</small>
                          <h2>
                            {paymentOptions?.ready
                              ? "Pay with M-Pesa"
                              : "Online payment is being set up"}
                          </h2>
                          <p>
                            {paymentOptions?.ready
                              ? `Your payment goes directly to ${paymentOptions.destination?.bank_name} ${paymentOptions.destination?.masked_account}.`
                              : "Your property manager has not activated a verified bank destination yet."}
                          </p>
                        </div>
                      </div>
                      {paymentOptions?.ready && (
                        <form onSubmit={startPayment}>
                          <div className="tp-pay-choice">
                            <button
                              type="button"
                              className={
                                payForm.mode === "overdue" ? "active" : ""
                              }
                              onClick={() =>
                                setPayForm((value) => ({
                                  ...value,
                                  mode: "overdue",
                                }))
                              }
                            >
                              <strong>Pay overdue rent</strong>
                              <small>{cash(paymentOptions.balance)}</small>
                            </button>
                            <button
                              type="button"
                              className={
                                payForm.mode === "months" ? "active" : ""
                              }
                              onClick={() =>
                                setPayForm((value) => ({
                                  ...value,
                                  mode: "months",
                                }))
                              }
                            >
                              <strong>Pay for months</strong>
                              <small>
                                {cash(paymentOptions.monthlyRent)} per month
                              </small>
                            </button>
                          </div>
                          {payForm.mode === "months" && (
                            <label>
                              <span>Number of months</span>
                              <select
                                value={payForm.months}
                                onChange={(event) =>
                                  setPayForm((value) => ({
                                    ...value,
                                    months: Number(event.target.value),
                                  }))
                                }
                              >
                                {[1, 2, 3, 4, 5, 6, 12].map((value) => (
                                  <option key={value} value={value}>
                                    {value} month{value === 1 ? "" : "s"} ·{" "}
                                    {cash(paymentOptions.monthlyRent * value)}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                          <label>
                            <span>M-Pesa phone number</span>
                            <div className="tp-phone-input">
                              <Smartphone size={16} />
                              <input
                                value={payForm.phone}
                                onChange={(event) =>
                                  setPayForm((value) => ({
                                    ...value,
                                    phone: event.target.value,
                                  }))
                                }
                                placeholder="07XXXXXXXX"
                                required
                              />
                            </div>
                          </label>
                          {error && (
                            <div className="tp-inline-error">{error}</div>
                          )}
                          <button
                            className="tp-pay-button"
                            disabled={
                              paymentBusy ||
                              (payForm.mode === "overdue" &&
                                paymentOptions.balance <= 0)
                            }
                          >
                            {paymentBusy ? (
                              <>
                                <LoaderCircle className="tp-spin" size={16} />{" "}
                                Sending prompt…
                              </>
                            ) : (
                              <>
                                Pay{" "}
                                {cash(
                                  payForm.mode === "overdue"
                                    ? paymentOptions.balance
                                    : paymentOptions.monthlyRent *
                                        payForm.months,
                                )}
                              </>
                            )}
                          </button>
                          {paymentRequest && (
                            <div
                              className={`tp-payment-progress ${paymentRequest.status}`}
                            >
                              <span>
                                {paymentRequest.status === "paid" ? (
                                  <CheckCircle2 size={18} />
                                ) : paymentRequest.status === "failed" ? (
                                  <AlertCircle size={18} />
                                ) : (
                                  <LoaderCircle className="tp-spin" size={18} />
                                )}
                              </span>
                              <div>
                                <strong>
                                  {paymentRequest.status === "paid"
                                    ? "Payment confirmed"
                                    : paymentRequest.status === "failed"
                                      ? "Payment was not completed"
                                      : "Check your phone"}
                                </strong>
                                <small>
                                  {paymentRequest.result_description ||
                                    "Enter your M-Pesa PIN to complete payment."}
                                </small>
                                {paymentRequest.status === "paid" && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      api.downloadTenantReceipt(
                                        paymentRequest.id,
                                        `receipt-${paymentRequest.mpesa_receipt || "payment"}.pdf`,
                                      )
                                    }
                                  >
                                    Download receipt
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </form>
                      )}
                    </section>
                    <div className="tp-stats tp-payment-stats">
                      <article>
                        <span>
                          <WalletCards size={18} /> Total paid
                        </span>
                        <strong>
                          {cash(
                            data.payments.reduce(
                              (sum, item) => sum + Number(item.amount || 0),
                              0,
                            ),
                          )}
                        </strong>
                        <small>
                          {data.payments.length} payment
                          {data.payments.length === 1 ? "" : "s"} recorded
                        </small>
                      </article>
                      <article className={data.balance > 0 ? "due" : "clear"}>
                        <span>
                          <CircleDollarSign size={18} /> Current balance
                        </span>
                        <strong>{cash(data.balance)}</strong>
                        <small>
                          {data.balance > 0
                            ? "Amount still outstanding"
                            : "Nothing outstanding"}
                        </small>
                      </article>
                    </div>
                    <section className="tp-panel tp-list-panel">
                      <div className="tp-table-head">
                        <span>Payment</span>
                        <span>Method</span>
                        <span>Date</span>
                        <span>Amount</span>
                      </div>
                      {data.payments.map((payment) => (
                        <div className="tp-table-row" key={payment.id}>
                          <span>
                            <i className="success">
                              <CheckCircle2 size={16} />
                            </i>
                            <b>{payment.reference}</b>
                            <small>Confirmed</small>
                          </span>
                          <span>{title(payment.payment_method)}</span>
                          <span>{day(payment.paid_at)}</span>
                          <strong>
                            {cash(payment.amount)}
                            {payment.payment_request_id && (
                              <button
                                className="tp-receipt-link"
                                onClick={() =>
                                  api
                                    .downloadTenantReceipt(
                                      payment.payment_request_id,
                                      `receipt-${payment.reference}.pdf`,
                                    )
                                    .catch((err) =>
                                      setError(
                                        err instanceof Error
                                          ? err.message
                                          : "Could not download receipt",
                                      ),
                                    )
                                }
                              >
                                <Download size={13} /> Receipt
                              </button>
                            )}
                          </strong>
                        </div>
                      ))}
                      {!data.payments.length && (
                        <Empty
                          icon={ReceiptText}
                          title="No payments recorded"
                          text="Confirmed rent and utility payments will show here."
                        />
                      )}
                    </section>
                  </div>
                )}
                {tab === "documents" && (
                  <div className="tp-page">
                    <PageHead
                      kicker="DOCUMENTS"
                      title="Your documents"
                      text="Lease agreements and documents shared during your onboarding."
                    />
                    <div className="tp-document-grid">
                      {data.documents.map((document) => (
                        <article key={document.id}>
                          <span className="tp-doc-icon">
                            <FileText size={22} />
                          </span>
                          <div>
                            <small>{title(document.type)}</small>
                            <strong>{document.name}</strong>
                            <em>Added {day(document.created_at)}</em>
                          </div>
                          {document.url ? (
                            <button
                              className="tp-doc-download"
                              onClick={() =>
                                api
                                  .downloadTenantDocument(
                                    document.id,
                                    document.name,
                                  )
                                  .catch((err) =>
                                    setError(
                                      err instanceof Error
                                        ? err.message
                                        : "Could not download document",
                                    ),
                                  )
                              }
                            >
                              <Download size={16} /> Open
                            </button>
                          ) : (
                            <span className="tp-doc-ready">
                              <CheckCircle2 size={14} /> Available
                            </span>
                          )}
                        </article>
                      ))}
                    </div>
                    {error && <div className="tp-inline-error">{error}</div>}
                    {!data.documents.length && (
                      <section className="tp-panel">
                        <Empty
                          icon={FileText}
                          title="No documents shared yet"
                          text="Your agreement and onboarding documents will appear here when management uploads them."
                        />
                      </section>
                    )}
                  </div>
                )}
                {tab === "tickets" && (
                  <div className="tp-page">
                    <PageHead
                      kicker="TICKETS"
                      title="Help and complaints"
                      text="Report an issue and follow its progress without making a phone call."
                    />
                    <div className="tp-ticket-grid">
                      <form className="tp-ticket-form" onSubmit={submitTicket}>
                        <div>
                          <span>NEW TICKET</span>
                          <h2>What can we help with?</h2>
                        </div>
                        <label>
                          <span>Issue type</span>
                          <select
                            value={form.category}
                            onChange={(e) =>
                              setForm({ ...form, category: e.target.value })
                            }
                          >
                            <option value="maintenance">
                              Repair / maintenance
                            </option>
                            <option value="water">Water</option>
                            <option value="payment">Payment</option>
                            <option value="security">Security</option>
                            <option value="noise">Noise</option>
                            <option value="other">Other</option>
                          </select>
                        </label>
                        <label>
                          <span>Priority</span>
                          <select
                            value={form.priority}
                            onChange={(e) =>
                              setForm({ ...form, priority: e.target.value })
                            }
                          >
                            <option value="normal">Normal</option>
                            <option value="low">Low</option>
                            <option value="high">High</option>
                            <option value="urgent">Urgent</option>
                          </select>
                        </label>
                        <label className="full">
                          <span>Short title</span>
                          <input
                            required
                            minLength={3}
                            value={form.subject}
                            onChange={(e) =>
                              setForm({ ...form, subject: e.target.value })
                            }
                            placeholder="e.g. Kitchen tap is leaking"
                          />
                        </label>
                        <label className="full">
                          <span>Tell us more</span>
                          <textarea
                            required
                            minLength={5}
                            rows={5}
                            value={form.description}
                            onChange={(e) =>
                              setForm({ ...form, description: e.target.value })
                            }
                            placeholder="Describe the issue clearly"
                          />
                        </label>
                        {error && (
                          <div className="tp-inline-error">{error}</div>
                        )}
                        {sent && (
                          <div className="tp-inline-success">
                            <CheckCircle2 size={15} /> Ticket sent to
                            management.
                          </div>
                        )}
                        <button className="tp-send" disabled={sending}>
                          {sending ? (
                            "Sending…"
                          ) : (
                            <>
                              <Send size={16} /> Send ticket
                            </>
                          )}
                        </button>
                      </form>
                      <section className="tp-panel tp-ticket-list">
                        <div className="tp-panel-head">
                          <div>
                            <span>YOUR TICKETS</span>
                            <h2>Progress</h2>
                          </div>
                          <em>{data.tickets.length}</em>
                        </div>
                        {data.tickets.map((ticket) => (
                          <article key={ticket.id}>
                            <div>
                              <span
                                className={`tp-priority ${ticket.priority}`}
                              >
                                {title(ticket.priority)}
                              </span>
                              <strong>{ticket.subject}</strong>
                              <small>
                                {title(ticket.category)} ·{" "}
                                {day(ticket.created_at)}
                              </small>
                            </div>
                            <span
                              className={`tp-ticket-status ${ticket.status}`}
                            >
                              {title(ticket.status)}
                            </span>
                          </article>
                        ))}
                        {!data.tickets.length && (
                          <Empty
                            icon={MessageSquarePlus}
                            title="No tickets yet"
                            text="When you need help, raise a ticket using this form."
                          />
                        )}
                      </section>
                    </div>
                  </div>
                )}
              </>
            )
          )}
        </section>
      </main>
    </div>
  );
}

function PageHead({
  kicker,
  title,
  text,
}: {
  kicker: string;
  title: string;
  text: string;
}) {
  return (
    <div className="tp-page-head">
      <span>{kicker}</span>
      <h1>{title}</h1>
      <p>{text}</p>
    </div>
  );
}
function Empty({
  icon: Icon,
  title,
  text,
}: {
  icon: any;
  title: string;
  text: string;
}) {
  return (
    <div className="tp-empty">
      <Icon size={25} />
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}
