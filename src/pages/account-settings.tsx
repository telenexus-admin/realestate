import { FormEvent, useEffect, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  FileText,
  KeyRound,
  Mail,
  Save,
  ShieldCheck,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import {
  api,
  type BillingContext,
  type OnboardingSettings,
  type OnboardingTemplate,
} from "../api";
import { Panel, Status } from "../ui";
import "./account-settings.css";
import SmsSettingsPanel from "./sms-settings-panel";
import PaymentSettingsPanel from "./payment-settings-panel";

const emptyCaretaker = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  temporaryPassword: "",
  propertyIds: [] as string[],
};
const defaults: OnboardingSettings = {
  sender_name: "PropOS by Polyizon",
  reply_to_email: "",
  welcome_message:
    "Welcome to your new home. Your portal keeps your payments, documents and support requests in one place.",
  portal_base_url: "https://propos.polyizon.tech",
  auto_create_portal: true,
  auto_send_welcome: true,
  invoice_first_rent: true,
  invoice_deposit: true,
};
const emptyTemplate = {
  name: "Tenancy agreement",
  propertyId: "",
  documentType: "agreement",
  sourceType: "draft",
  body: "TENANCY TERMS\n\nThis agreement is between {{organization_name}} and {{tenant_name}} for {{property_name}}, Unit {{unit_number}}.\n\nThe tenancy runs from {{start_date}} to {{end_date}}. Monthly rent is {{monthly_rent}} and the security deposit is {{deposit}}. Rent is payable on the agreed due date. The tenant agrees to keep the premises in good condition and follow the property rules.",
  makeActive: true,
};

async function base64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 32768)
    binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
  return btoa(binary);
}

export default function AccountSettings() {
  const [context, setContext] = useState<BillingContext | null>(null),
    [team, setTeam] = useState<any[]>([]),
    [caretaker, setCaretaker] = useState(emptyCaretaker),
    [settings, setSettings] = useState<OnboardingSettings>(defaults),
    [templates, setTemplates] = useState<OnboardingTemplate[]>([]),
    [template, setTemplate] = useState(emptyTemplate),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [caretakerError, setCaretakerError] = useState(""),
    [caretakerNotice, setCaretakerNotice] = useState("");
  async function load() {
    setError("");
    try {
      const ctx = await api.billingContext();
      setContext(ctx);
      if (ctx.canManageTeam) {
        const [members, onboarding] = await Promise.all([
          api.team(),
          api.onboardingSettings(),
        ]);
        setTeam(members);
        setSettings({ ...defaults, ...onboarding.settings });
        setTemplates(onboarding.templates);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load account settings",
      );
    }
  }
  useEffect(() => {
    void load();
  }, []);
  function toggleProperty(id: string) {
    setCaretaker((current) => ({
      ...current,
      propertyIds: current.propertyIds.includes(id)
        ? current.propertyIds.filter((value) => value !== id)
        : [...current.propertyIds, id],
    }));
  }
  async function submitCaretaker(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setCaretakerError("");
    setCaretakerNotice("");
    try {
      await api.createCaretaker(caretaker);
      setCaretaker(emptyCaretaker);
      setCaretakerNotice("Caretaker account created and ready to sign in.");
      await load();
    } catch (err) {
      setCaretakerError(
        err instanceof Error ? err.message : "Could not create caretaker",
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api.saveOnboardingSettings({
        senderName: settings.sender_name,
        replyToEmail: settings.reply_to_email || "",
        welcomeMessage: settings.welcome_message,
        portalBaseUrl: settings.portal_base_url,
        autoCreatePortal: settings.auto_create_portal,
        autoSendWelcome: settings.auto_send_welcome,
        invoiceFirstRent: settings.invoice_first_rent,
        invoiceDeposit: settings.invoice_deposit,
      });
      setNotice("Tenant onboarding settings saved.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save onboarding settings",
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveTemplate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api.createOnboardingTemplate({
        ...template,
        propertyId: template.propertyId || undefined,
        fileName: file?.name,
        mimeType: file?.type,
        contentBase64: file ? await base64(file) : undefined,
      });
      setTemplate(emptyTemplate);
      setFile(null);
      setNotice("Onboarding document saved and ready for new tenants.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save document");
    } finally {
      setBusy(false);
    }
  }
  async function changeTemplate(id: string, status: "active" | "archived") {
    setBusy(true);
    setError("");
    try {
      await api.updateOnboardingTemplateStatus(id, status);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update document",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="module-header">
        <div>
          <div className="eyebrow">Settings</div>
          <h1>Account and onboarding</h1>
          <p>Control access and the welcome pack sent to every new tenant.</p>
        </div>
      </div>
      {notice && (
        <div className="settings-notice">
          <CheckCircle2 size={16} />
          {notice}
        </div>
      )}
      {error && (
        <div className="settings-error">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}
      <div className="settings-summary">
        <article>
          <Building2 size={18} />
          <div>
            <span>Company</span>
            <strong>{context?.organization.name || "Loading…"}</strong>
            <small>Code: {context?.organization.slug || "—"}</small>
          </div>
        </article>
        <article>
          <ShieldCheck size={18} />
          <div>
            <span>Your access</span>
            <strong>{context?.role?.replace("_", " ") || "—"}</strong>
            <small>{context?.properties.length || 0} visible properties</small>
          </div>
        </article>
      </div>
      {context?.canManageTeam ? (
        <>
          <PaymentSettingsPanel />
          <SmsSettingsPanel />
          <Panel title="Tenant welcome email" kicker="Automatic onboarding">
            <form className="onboarding-form" onSubmit={saveSettings}>
              <div className="onboarding-callout">
                <Mail size={20} />
                <div>
                  <strong>One welcome pack, sent automatically</strong>
                  <span>
                    Portal activation, agreements and onboarding invoices are
                    emailed after the tenant is created.
                  </span>
                </div>
              </div>
              <div className="form-grid">
                <label>
                  <span>Sender name</span>
                  <input
                    value={settings.sender_name}
                    onChange={(e) =>
                      setSettings((v) => ({
                        ...v,
                        sender_name: e.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <label>
                  <span>Reply-to email</span>
                  <input
                    type="email"
                    value={settings.reply_to_email || ""}
                    onChange={(e) =>
                      setSettings((v) => ({
                        ...v,
                        reply_to_email: e.target.value,
                      }))
                    }
                    placeholder="manager@example.com"
                  />
                </label>
                <label className="full">
                  <span>Tenant portal address</span>
                  <input
                    type="url"
                    value={settings.portal_base_url}
                    onChange={(e) =>
                      setSettings((v) => ({
                        ...v,
                        portal_base_url: e.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <label className="full">
                  <span>Welcome message</span>
                  <textarea
                    rows={4}
                    value={settings.welcome_message}
                    onChange={(e) =>
                      setSettings((v) => ({
                        ...v,
                        welcome_message: e.target.value,
                      }))
                    }
                    required
                  />
                </label>
              </div>
              <div className="onboarding-switches">
                <label>
                  <input
                    type="checkbox"
                    checked={settings.auto_create_portal}
                    onChange={(e) =>
                      setSettings((v) => ({
                        ...v,
                        auto_create_portal: e.target.checked,
                      }))
                    }
                  />
                  <span>
                    <strong>Create portal account</strong>
                    <small>
                      Send a secure link so the tenant sets their own password.
                    </small>
                  </span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={settings.auto_send_welcome}
                    onChange={(e) =>
                      setSettings((v) => ({
                        ...v,
                        auto_send_welcome: e.target.checked,
                      }))
                    }
                  />
                  <span>
                    <strong>Send welcome email</strong>
                    <small>
                      Includes portal details and attached documents.
                    </small>
                  </span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={settings.invoice_first_rent}
                    onChange={(e) =>
                      setSettings((v) => ({
                        ...v,
                        invoice_first_rent: e.target.checked,
                      }))
                    }
                  />
                  <span>
                    <strong>Invoice first rent</strong>
                    <small>
                      The monthly billing run will not duplicate it.
                    </small>
                  </span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={settings.invoice_deposit}
                    onChange={(e) =>
                      setSettings((v) => ({
                        ...v,
                        invoice_deposit: e.target.checked,
                      }))
                    }
                  />
                  <span>
                    <strong>Invoice deposit</strong>
                    <small>
                      Only created when the lease has a deposit amount.
                    </small>
                  </span>
                </label>
              </div>
              <div className="modal-actions">
                <button className="primary-button" disabled={busy}>
                  <Save size={15} />
                  {busy ? "Saving…" : "Save onboarding settings"}
                </button>
              </div>
            </form>
          </Panel>
          <Panel title="Agreements and documents" kicker="Tenant welcome pack">
            <div className="template-list">
              {templates.map((item) => (
                <article key={item.id}>
                  <div className="template-icon">
                    <FileText size={17} />
                  </div>
                  <div>
                    <strong>{item.name}</strong>
                    <span>
                      {item.property_name || "All properties"} ·{" "}
                      {item.document_type.replace("_", " ")} · version{" "}
                      {item.version}
                    </span>
                    <small>
                      {item.source_type === "draft"
                        ? "Drafted in PropOS"
                        : item.file_name}
                    </small>
                  </div>
                  <Status value={item.status} />
                  <button
                    type="button"
                    className="secondary-button compact"
                    disabled={busy}
                    onClick={() =>
                      void changeTemplate(
                        item.id,
                        item.status === "active" ? "archived" : "active",
                      )
                    }
                  >
                    {item.status === "active" ? "Archive" : "Make active"}
                  </button>
                </article>
              ))}
              {!templates.length && (
                <div className="settings-empty">
                  <FileText size={22} />
                  <span>No onboarding documents yet.</span>
                </div>
              )}
            </div>
          </Panel>
          <Panel title="Add onboarding document" kicker="Upload or draft">
            <form className="onboarding-form" onSubmit={saveTemplate}>
              <div className="form-grid">
                <label>
                  <span>Document name</span>
                  <input
                    value={template.name}
                    onChange={(e) =>
                      setTemplate((v) => ({ ...v, name: e.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  <span>Document type</span>
                  <select
                    value={template.documentType}
                    onChange={(e) =>
                      setTemplate((v) => ({
                        ...v,
                        documentType: e.target.value,
                      }))
                    }
                  >
                    <option value="agreement">Tenancy agreement</option>
                    <option value="house_rules">House rules</option>
                    <option value="move_in">Move-in information</option>
                    <option value="other">Other document</option>
                  </select>
                </label>
                <label>
                  <span>Applies to</span>
                  <select
                    value={template.propertyId}
                    onChange={(e) =>
                      setTemplate((v) => ({ ...v, propertyId: e.target.value }))
                    }
                  >
                    <option value="">All properties</option>
                    {context.properties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Create document</span>
                  <select
                    value={template.sourceType}
                    onChange={(e) => {
                      setFile(null);
                      setTemplate((v) => ({
                        ...v,
                        sourceType: e.target.value,
                      }));
                    }}
                  >
                    <option value="draft">Draft in PropOS</option>
                    <option value="upload">Upload PDF or Word</option>
                  </select>
                </label>
                {template.sourceType === "draft" ? (
                  <label className="full">
                    <span>Document wording</span>
                    <textarea
                      className="terms-editor"
                      rows={12}
                      value={template.body}
                      onChange={(e) =>
                        setTemplate((v) => ({ ...v, body: e.target.value }))
                      }
                      required
                    />
                    <small>
                      Available fields: {"{{tenant_name}}"},{" "}
                      {"{{property_name}}"}, {"{{unit_number}}"},{" "}
                      {"{{monthly_rent}}"}, {"{{deposit}}"}, {"{{start_date}}"}{" "}
                      and {"{{end_date}}"}.
                    </small>
                  </label>
                ) : (
                  <label className="full template-upload">
                    <Upload size={20} />
                    <span>{file?.name || "Choose PDF or Word document"}</span>
                    <small>Maximum 8 MB</small>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx"
                      required
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                  </label>
                )}
              </div>
              <label className="simple-check">
                <input
                  type="checkbox"
                  checked={template.makeActive}
                  onChange={(e) =>
                    setTemplate((v) => ({ ...v, makeActive: e.target.checked }))
                  }
                />
                <span>Use this document for new tenants immediately</span>
              </label>
              <div className="modal-actions">
                <button
                  className="primary-button"
                  disabled={busy || (template.sourceType === "upload" && !file)}
                >
                  <FileText size={15} />
                  {busy ? "Saving…" : "Save document"}
                </button>
              </div>
            </form>
          </Panel>
          <Panel title="Caretakers" kicker="Assigned-property access">
            <div className="team-list">
              {team
                .filter((member) => member.role === "caretaker")
                .map((member) => (
                  <article key={member.id}>
                    <div className="team-avatar">
                      {member.first_name?.[0]}
                      {member.last_name?.[0]}
                    </div>
                    <div>
                      <strong>
                        {member.first_name} {member.last_name}
                      </strong>
                      <span>
                        {member.email} · {member.phone}
                      </span>
                      <small>
                        {(member.assigned_properties || [])
                          .map((p: any) => p.name)
                          .join(", ") || "No property assigned"}
                      </small>
                    </div>
                    <Status value={member.status} />
                  </article>
                ))}
              {!team.some((member) => member.role === "caretaker") && (
                <div className="settings-empty">
                  <Users size={22} />
                  <span>No caretakers yet.</span>
                </div>
              )}
            </div>
          </Panel>
          <Panel title="Add caretaker" kicker="Simple, restricted account">
            <form className="caretaker-form" onSubmit={submitCaretaker}>
              <div className="form-grid">
                <label>
                  <span>First name</span>
                  <input
                    value={caretaker.firstName}
                    onChange={(e) =>
                      setCaretaker((v) => ({ ...v, firstName: e.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  <span>Last name</span>
                  <input
                    value={caretaker.lastName}
                    onChange={(e) =>
                      setCaretaker((v) => ({ ...v, lastName: e.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    value={caretaker.email}
                    onChange={(e) => {
                      setCaretakerError("");
                      setCaretaker((v) => ({ ...v, email: e.target.value }));
                    }}
                    required
                  />
                </label>
                <label>
                  <span>Phone</span>
                  <input
                    type="tel"
                    value={caretaker.phone}
                    onChange={(e) =>
                      setCaretaker((v) => ({ ...v, phone: e.target.value }))
                    }
                    required
                  />
                </label>
                <label className="full">
                  <span>Temporary password</span>
                  <div className="settings-password">
                    <KeyRound size={15} />
                    <input
                      type="password"
                      minLength={12}
                      value={caretaker.temporaryPassword}
                      onChange={(e) =>
                        setCaretaker((v) => ({
                          ...v,
                          temporaryPassword: e.target.value,
                        }))
                      }
                      required
                    />
                  </div>
                  <small>At least 12 characters.</small>
                </label>
                <fieldset className="full">
                  <legend>Assigned properties</legend>
                  <div className="property-checks">
                    {context.properties.map((property) => (
                      <label key={property.id}>
                        <input
                          type="checkbox"
                          checked={caretaker.propertyIds.includes(property.id)}
                          onChange={() => toggleProperty(property.id)}
                        />
                        <span>{property.name}</span>
                      </label>
                    ))}
                  </div>
                  {!caretaker.propertyIds.length && (
                    <small className="caretaker-property-hint">
                      Select at least one property to enable the account.
                    </small>
                  )}
                </fieldset>
              </div>
              {caretakerError && (
                <div className="caretaker-feedback error" role="alert">
                  <AlertTriangle size={16} />
                  <span>{caretakerError}</span>
                </div>
              )}
              {caretakerNotice && (
                <div className="caretaker-feedback success" role="status">
                  <CheckCircle2 size={16} />
                  <span>{caretakerNotice}</span>
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="submit"
                  className="primary-button"
                  disabled={busy || !caretaker.propertyIds.length}
                >
                  <UserPlus size={15} />
                  {busy ? "Creating…" : "Create caretaker account"}
                </button>
              </div>
            </form>
          </Panel>
        </>
      ) : (
        <Panel title="Your assigned properties" kicker="Caretaker access">
          <div className="assigned-property-list">
            {context?.properties.map((property) => (
              <div key={property.id}>
                <Building2 size={15} />
                <span>{property.name}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}
