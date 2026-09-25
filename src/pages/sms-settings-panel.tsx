import { FormEvent, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  KeyRound,
  MessageSquareText,
  Smartphone,
} from "lucide-react";
import { api, type SmsSettings } from "../api";
import { Panel } from "../ui";
import "./sms-settings-panel.css";

const providers = [
  {
    id: "blessed_text" as const,
    name: "Blessed Text",
    note: "API key and approved Sender ID",
  },
  {
    id: "savvy" as const,
    name: "Savvy Bulk SMS",
    note: "API key, Partner ID and Sender ID",
  },
  {
    id: "talksasa" as const,
    name: "Talk Sasa",
    note: "API token and approved Sender ID",
  },
];
const defaults: SmsSettings = {
  provider: "blessed_text",
  sender_id: "",
  partner_id: "",
  enabled: false,
  configured_at: null,
  has_api_key: false,
};

export default function SmsSettingsPanel() {
  const [settings, setSettings] = useState<SmsSettings>(defaults),
    [apiKey, setApiKey] = useState(""),
    [testPhone, setTestPhone] = useState(""),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(""),
    [notice, setNotice] = useState<{
      type: "success" | "error";
      text: string;
    } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    api
      .smsSettings()
      .then((sms) => setSettings({ ...defaults, ...sms }))
      .catch((err) =>
        setNotice({
          type: "error",
          text:
            err instanceof Error ? err.message : "Could not load SMS settings",
        }),
      );
  }, []);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const selected = providers.find(
    (provider) => provider.id === settings.provider,
  )!;
  function choose(provider: SmsSettings["provider"]) {
    setSettings((current) => ({
      ...current,
      provider,
      partner_id: provider === "savvy" ? current.partner_id : "",
      has_api_key: current.provider === provider && current.has_api_key,
    }));
    setApiKey("");
    setNotice(null);
    setOpen(false);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy("save");
    setNotice(null);
    try {
      const saved = await api.saveSmsSettings({
        provider: settings.provider,
        apiKey,
        senderId: settings.sender_id,
        partnerId: settings.partner_id || "",
        enabled: true,
      });
      setSettings({ ...settings, ...saved });
      setApiKey("");
      setNotice({
        type: "success",
        text: "SMS provider saved securely and is ready.",
      });
    } catch (err) {
      setNotice({
        type: "error",
        text:
          err instanceof Error ? err.message : "Could not save SMS settings",
      });
    } finally {
      setBusy("");
    }
  }
  async function test() {
    if (!testPhone.trim()) {
      setNotice({
        type: "error",
        text: "Enter a phone number for the test SMS.",
      });
      return;
    }
    setBusy("test");
    setNotice(null);
    try {
      const sent = await api.testSms(testPhone);
      setNotice({
        type: "success",
        text: `Test SMS sent to +${sent.recipient}.`,
      });
    } catch (err) {
      setNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Test SMS failed",
      });
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="sms-settings-stack">
      <Panel title="SMS configuration" kicker="Communication provider">
        <form className="sms-config-form" onSubmit={save}>
          <div className="sms-config-intro">
            <div>
              <MessageSquareText size={19} />
              <span>
                <strong>Connect an SMS provider</strong>
                <small>
                  Credentials are encrypted and belong only to this property
                  account.
                </small>
              </span>
            </div>
            <em
              className={
                settings.has_api_key && settings.enabled ? "ready" : ""
              }
            >
              {settings.has_api_key && settings.enabled
                ? "Configured"
                : "Not configured"}
            </em>
          </div>
          <div className="sms-provider-field" ref={menuRef}>
            <label>Provider</label>
            <button
              type="button"
              className="sms-provider-trigger"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
            >
              <span>
                <strong>{selected.name}</strong>
                <small>{selected.note}</small>
              </span>
              <ChevronDown size={17} />
            </button>
            {open && (
              <div className="sms-provider-menu">
                {providers.map((provider) => (
                  <button
                    type="button"
                    key={provider.id}
                    onClick={() => choose(provider.id)}
                  >
                    <span>
                      <strong>{provider.name}</strong>
                      <small>{provider.note}</small>
                    </span>
                    {settings.provider === provider.id && <Check size={16} />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="form-grid sms-fields">
            <label>
              <span>
                {settings.provider === "talksasa" ? "API token" : "API key"}
              </span>
              <div className="settings-password">
                <KeyRound size={15} />
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    settings.has_api_key
                      ? "Saved — enter only to replace"
                      : "Enter provider credential"
                  }
                  required={!settings.has_api_key}
                />
              </div>
            </label>
            <label>
              <span>Sender ID / shortcode</span>
              <input
                value={settings.sender_id}
                onChange={(e) =>
                  setSettings((v) => ({ ...v, sender_id: e.target.value }))
                }
                placeholder="Approved Sender ID"
                required
              />
            </label>
            {settings.provider === "savvy" && (
              <label className="full">
                <span>Partner ID</span>
                <input
                  value={settings.partner_id || ""}
                  onChange={(e) =>
                    setSettings((v) => ({ ...v, partner_id: e.target.value }))
                  }
                  placeholder="Savvy Partner ID"
                  required
                />
              </label>
            )}
          </div>
          <div className="sms-config-actions">
            <button className="primary-button" disabled={!!busy}>
              {busy === "save" ? "Saving…" : "Save provider"}
            </button>
          </div>
        </form>
        <div className="sms-test-row">
          <Smartphone size={17} />
          <input
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            placeholder="2547XXXXXXXX"
          />
          <button
            type="button"
            className="secondary-button"
            onClick={() => void test()}
            disabled={!!busy || !settings.has_api_key}
          >
            {busy === "test" ? "Sending…" : "Send test SMS"}
          </button>
        </div>
        {notice && (
          <div
            className={`sms-feedback ${notice.type}`}
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
      </Panel>
    </div>
  );
}
