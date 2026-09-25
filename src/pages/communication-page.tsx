import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock3,
  FileText,
  LoaderCircle,
  MessageSquareText,
  Plus,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import {
  api,
  type CommunicationAudience,
  type CommunicationRecipient,
  type CommunicationTemplate,
  type SmsSettings,
} from "../api";
import { Panel } from "../ui";
import "./communication-page.css";

const audienceOptions: [CommunicationAudience, string, string][] = [
  ["all", "All tenants", "Every tenant with a phone number"],
  ["due", "Payments due", "Tenants with an outstanding balance"],
  ["paid", "Fully paid", "Tenants with no outstanding balance"],
  ["property", "By property", "Everyone in one property"],
  ["unit", "By unit", "The tenant in a specific unit"],
  ["tenant", "One tenant", "Choose a single person"],
];
const sampleTemplates = [
  {
    name: "Planned maintenance",
    message:
      "Hello {{name}}, please note that maintenance is scheduled at {{property}} on [date/time]. We apologise for any inconvenience.",
  },
  {
    name: "Payment reminder",
    message:
      "Hello {{name}}, your current balance is {{balance}}. Kindly make payment or contact the property office if you need help.",
  },
];
const blankSettings: SmsSettings = {
  provider: "blessed_text",
  sender_id: "",
  enabled: false,
  configured_at: null,
  has_api_key: false,
};

export default function CommunicationPage() {
  const [audience, setAudience] = useState<CommunicationAudience>("all"),
    [targetId, setTargetId] = useState(""),
    [message, setMessage] = useState(""),
    [recipients, setRecipients] = useState<CommunicationRecipient[]>([]),
    [recipientCount, setRecipientCount] = useState(0),
    [templates, setTemplates] = useState<CommunicationTemplate[]>([]),
    [properties, setProperties] = useState<any[]>([]),
    [units, setUnits] = useState<any[]>([]),
    [tenants, setTenants] = useState<any[]>([]),
    [history, setHistory] = useState<any[]>([]),
    [settings, setSettings] = useState<SmsSettings>(blankSettings),
    [loading, setLoading] = useState(true),
    [previewing, setPreviewing] = useState(false),
    [busy, setBusy] = useState(""),
    [notice, setNotice] = useState<{
      type: "success" | "error";
      text: string;
    } | null>(null),
    [creating, setCreating] = useState(false),
    [templateName, setTemplateName] = useState(""),
    [templateCategory, setTemplateCategory] = useState("general");
  async function load() {
    setLoading(true);
    try {
      const [
        savedTemplates,
        propertyRows,
        unitRows,
        tenantRows,
        deliveryRows,
        sms,
      ] = await Promise.all([
        api.communicationTemplates(),
        api.properties(),
        api.units(),
        api.tenants(),
        api.communicationHistory(),
        api.smsSettings(),
      ]);
      setTemplates(savedTemplates);
      setProperties(propertyRows);
      setUnits(unitRows);
      setTenants(tenantRows);
      setHistory(deliveryRows);
      setSettings(sms);
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not load communication tools",
      });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    setTargetId("");
  }, [audience]);
  useEffect(() => {
    const requiresTarget = ["tenant", "property", "unit"].includes(audience);
    if (requiresTarget && !targetId) {
      setRecipients([]);
      setRecipientCount(0);
      return;
    }
    let active = true;
    setPreviewing(true);
    api
      .communicationRecipients(audience, targetId || undefined)
      .then((result) => {
        if (active) {
          setRecipients(result.recipients);
          setRecipientCount(result.count);
        }
      })
      .catch((error) => {
        if (active) {
          setRecipients([]);
          setRecipientCount(0);
          setNotice({
            type: "error",
            text:
              error instanceof Error
                ? error.message
                : "Could not preview recipients",
          });
        }
      })
      .finally(() => {
        if (active) setPreviewing(false);
      });
    return () => {
      active = false;
    };
  }, [audience, targetId]);
  const targetOptions = useMemo(
    () =>
      audience === "property"
        ? properties
        : audience === "unit"
          ? units
          : audience === "tenant"
            ? tenants
            : [],
    [audience, properties, units, tenants],
  );
  function optionLabel(row: any) {
    if (audience === "property") return row.name;
    if (audience === "unit")
      return `${row.property_name || properties.find((item) => item.id === row.property_id)?.name || "Property"} · ${row.unit_number}`;
    return `${row.first_name} ${row.last_name}${row.unit_number ? ` · ${row.unit_number}` : ""}`;
  }
  function useTemplate(template: { message: string }) {
    setMessage(template.message);
    setNotice(null);
    document.getElementById("communication-message")?.focus();
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!recipientCount) {
      setNotice({
        type: "error",
        text: "Choose an audience with at least one valid phone number.",
      });
      return;
    }
    setBusy("send");
    setNotice(null);
    try {
      const result = await api.sendTenantSms({
        audience,
        targetId: targetId || undefined,
        message,
      });
      setNotice({
        type: result.failed ? "error" : "success",
        text: `${result.sent} message${result.sent === 1 ? "" : "s"} sent${result.failed ? `. ${result.failed} failed` : "."}`,
      });
      setHistory(await api.communicationHistory());
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error ? error.message : "Messages could not be sent",
      });
    } finally {
      setBusy("");
    }
  }
  async function saveTemplate(event: FormEvent) {
    event.preventDefault();
    setBusy("template");
    setNotice(null);
    try {
      const saved = await api.createCommunicationTemplate({
        name: templateName,
        message,
        category: templateCategory,
      });
      setTemplates((current) => [saved, ...current]);
      setTemplateName("");
      setCreating(false);
      setNotice({ type: "success", text: "Message template saved." });
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Template could not be saved",
      });
    } finally {
      setBusy("");
    }
  }
  async function removeTemplate(id: string) {
    setBusy(id);
    try {
      await api.deleteCommunicationTemplate(id);
      setTemplates((current) => current.filter((item) => item.id !== id));
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Template could not be removed",
      });
    } finally {
      setBusy("");
    }
  }
  if (loading)
    return (
      <div className="communication-loading">
        <LoaderCircle size={22} />
        <span>Loading communication workspace…</span>
      </div>
    );
  return (
    <>
      <div className="module-header communication-heading">
        <div>
          <div className="eyebrow">Communication</div>
          <h1>Message tenants</h1>
          <p>
            Choose exactly who should receive an update, then send it by SMS.
          </p>
        </div>
        <div
          className={`provider-pill ${settings.enabled && settings.has_api_key ? "ready" : ""}`}
        >
          <MessageSquareText size={15} />
          <span>
            {settings.enabled && settings.has_api_key
              ? `${settings.sender_id} is ready`
              : "SMS provider not configured"}
          </span>
        </div>
      </div>
      {notice && (
        <div
          className={`communication-notice ${notice.type}`}
          role={notice.type === "error" ? "alert" : "status"}
        >
          {notice.type === "error" ? (
            <AlertTriangle size={16} />
          ) : (
            <CheckCircle2 size={16} />
          )}
          <span>{notice.text}</span>
        </div>
      )}
      <div className="communication-layout">
        <Panel title="New message" kicker="Recipients and message">
          <form className="communication-compose" onSubmit={send}>
            <fieldset>
              <legend>Who should receive this?</legend>
              <div className="audience-grid">
                {audienceOptions.map(([value, label, note]) => (
                  <button
                    type="button"
                    key={value}
                    className={audience === value ? "active" : ""}
                    onClick={() => setAudience(value)}
                  >
                    <span>
                      {value === "property" ? (
                        <Building2 size={16} />
                      ) : (
                        <Users size={16} />
                      )}
                    </span>
                    <strong>{label}</strong>
                    <small>{note}</small>
                  </button>
                ))}
              </div>
            </fieldset>
            {targetOptions.length > 0 && (
              <label className="communication-target">
                <span>
                  {audience === "tenant"
                    ? "Choose tenant"
                    : audience === "property"
                      ? "Choose property"
                      : "Choose unit"}
                </span>
                <select
                  value={targetId}
                  onChange={(event) => setTargetId(event.target.value)}
                  required
                >
                  <option value="">Select…</option>
                  {targetOptions.map((row) => (
                    <option key={row.id} value={row.id}>
                      {optionLabel(row)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="recipient-preview">
              <div>
                <Users size={18} />
                <span>
                  <strong>
                    {previewing
                      ? "Checking…"
                      : `${recipientCount} recipient${recipientCount === 1 ? "" : "s"}`}
                  </strong>
                  <small>
                    Only tenants with valid phone numbers are included.
                  </small>
                </span>
              </div>
              {recipients.length > 0 && (
                <div className="recipient-chips">
                  {recipients.slice(0, 5).map((person) => (
                    <span key={person.id}>
                      {person.first_name} {person.last_name}
                    </span>
                  ))}
                  {recipientCount > 5 && <em>+{recipientCount - 5} more</em>}
                </div>
              )}
            </div>
            <label className="communication-message">
              <span>Message</span>
              <textarea
                id="communication-message"
                rows={6}
                maxLength={480}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Write a clear update for your tenants…"
                required
              />
              <small>
                <span>
                  Fields: {"{{name}}"} {"{{property}}"} {"{{unit}}"}{" "}
                  {"{{balance}}"}
                </span>
                <em>{message.length}/480</em>
              </small>
            </label>
            <div className="communication-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setCreating(true)}
                disabled={!message.trim()}
              >
                <Plus size={15} /> Save as template
              </button>
              <button
                className="primary-button"
                disabled={!!busy || !recipientCount || !settings.has_api_key}
              >
                {busy === "send" ? (
                  <>
                    <LoaderCircle className="spin" size={15} /> Sending…
                  </>
                ) : (
                  <>
                    <Send size={15} /> Send to {recipientCount || 0}
                  </>
                )}
              </button>
            </div>
          </form>
        </Panel>
        <aside className="communication-side">
          <Panel title="Templates" kicker="Quick messages">
            <div className="template-quick-list">
              {templates.map((template) => (
                <article key={template.id}>
                  <button type="button" onClick={() => useTemplate(template)}>
                    <FileText size={15} />
                    <span>
                      <strong>{template.name}</strong>
                      <small>{template.message}</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="template-delete"
                    aria-label={`Delete ${template.name}`}
                    onClick={() => void removeTemplate(template.id)}
                    disabled={busy === template.id}
                  >
                    <Trash2 size={14} />
                  </button>
                </article>
              ))}
              {!templates.length &&
                sampleTemplates.map((template) => (
                  <article key={template.name}>
                    <button type="button" onClick={() => useTemplate(template)}>
                      <FileText size={15} />
                      <span>
                        <strong>{template.name}</strong>
                        <small>{template.message}</small>
                      </span>
                    </button>
                  </article>
                ))}
            </div>
          </Panel>
          <Panel title="Recent messages" kicker="Delivery activity">
            <div className="communication-history">
              {history.slice(0, 8).map((item) => (
                <article key={item.id}>
                  <div className={item.status === "sent" ? "sent" : "failed"}>
                    {item.status === "sent" ? (
                      <CheckCircle2 size={14} />
                    ) : (
                      <AlertTriangle size={14} />
                    )}
                  </div>
                  <span>
                    <strong>
                      {item.first_name
                        ? `${item.first_name} ${item.last_name}`
                        : item.recipient}
                    </strong>
                    <small>{item.message}</small>
                    <em>
                      <Clock3 size={11} />
                      {new Date(item.sent_at || item.created_at).toLocaleString(
                        "en-KE",
                        { dateStyle: "medium", timeStyle: "short" },
                      )}
                    </em>
                  </span>
                </article>
              ))}
              {!history.length && (
                <div className="communication-empty">
                  No tenant messages sent yet.
                </div>
              )}
            </div>
          </Panel>
        </aside>
      </div>
      {creating && (
        <div className="modal-backdrop">
          <form
            className="modal communication-template-modal"
            onSubmit={saveTemplate}
          >
            <div className="modal-head">
              <div>
                <span className="panel-kicker">Reusable message</span>
                <h2>Save template</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setCreating(false)}
              >
                ×
              </button>
            </div>
            <label>
              <span>Template name</span>
              <input
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                placeholder="e.g. Water interruption"
                required
              />
            </label>
            <label>
              <span>Category</span>
              <select
                value={templateCategory}
                onChange={(event) => setTemplateCategory(event.target.value)}
              >
                <option value="general">General</option>
                <option value="maintenance">Maintenance</option>
                <option value="payment">Payment</option>
                <option value="notice">Notice</option>
              </select>
            </label>
            <label>
              <span>Message</span>
              <textarea
                rows={5}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={480}
                required
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setCreating(false)}
              >
                Cancel
              </button>
              <button className="primary-button" disabled={busy === "template"}>
                {busy === "template" ? "Saving…" : "Save template"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
