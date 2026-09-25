import { FormEvent, useEffect, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Landmark,
  LockKeyhole,
  Save,
} from "lucide-react";
import { api, type PaymentDestination, type PaymentInstitution } from "../api";
import { Panel } from "../ui";
import "./payment-settings-panel.css";

export default function PaymentSettingsPanel() {
  const [institutions, setInstitutions] = useState<PaymentInstitution[]>([]),
    [profile, setProfile] = useState<PaymentDestination | null>(null),
    [form, setForm] = useState({
      institutionCode: "",
      accountName: "",
      accountNumber: "",
      branchName: "",
    }),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState<{
      type: "success" | "error";
      text: string;
    } | null>(null);
  useEffect(() => {
    api
      .paymentSettings()
      .then((data) => {
        setInstitutions(data.institutions);
        setProfile(data.profile);
        setForm({
          institutionCode:
            data.profile?.institution_code || data.institutions[0]?.code || "",
          accountName: data.profile?.account_name || "",
          accountNumber: "",
          branchName: data.profile?.branch_name || "",
        });
      })
      .catch((error) =>
        setNotice({
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "Could not load bank settings",
        }),
      );
  }, []);
  const selected = institutions.find(
    (item) => item.code === form.institutionCode,
  );
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const saved = await api.savePaymentDestination(form);
      setProfile(saved);
      setForm((current) => ({ ...current, accountNumber: "" }));
      setNotice({
        type: "success",
        text: "Bank destination submitted. Polyizon must verify it before tenant payments are enabled.",
      });
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not save bank destination",
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel title="Direct bank destination" kicker="Tenant rent payments">
      <form className="bank-settings-form" onSubmit={save}>
        <div className="bank-settings-intro">
          <span>
            <Landmark size={20} />
          </span>
          <div>
            <strong>Receive tenant M-Pesa payments in your bank</strong>
            <small>
              Polyizon STK sends rent directly to the selected bank Paybill and
              account.
            </small>
          </div>
          {profile && (
            <em className={profile.verification_status}>
              {profile.verification_status === "verified"
                ? "Active"
                : profile.verification_status === "pending"
                  ? "Awaiting verification"
                  : "Needs attention"}
            </em>
          )}
        </div>
        <div className="form-grid">
          <label>
            <span>Bank</span>
            <select
              value={form.institutionCode}
              onChange={(event) =>
                setForm((value) => ({
                  ...value,
                  institutionCode: event.target.value,
                  accountNumber: "",
                }))
              }
              required
            >
              <option value="">Choose bank</option>
              {institutions.map((bank) => (
                <option key={bank.code} value={bank.code}>
                  {bank.name} · Paybill {bank.paybill}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Account holder name</span>
            <input
              value={form.accountName}
              onChange={(event) =>
                setForm((value) => ({
                  ...value,
                  accountName: event.target.value,
                }))
              }
              placeholder="Name registered at the bank"
              required
            />
          </label>
          <label>
            <span>Bank account / collection reference</span>
            <div className="settings-password">
              <LockKeyhole size={15} />
              <input
                value={form.accountNumber}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    accountNumber: event.target.value,
                  }))
                }
                placeholder={
                  profile && profile.institution_code === form.institutionCode
                    ? `${profile.masked_account} — enter only to replace`
                    : selected?.hint || "Account number"
                }
                required={
                  !profile || profile.institution_code !== form.institutionCode
                }
              />
            </div>
            <small>{selected?.hint}</small>
          </label>
          <label>
            <span>Branch (optional)</span>
            <input
              value={form.branchName}
              onChange={(event) =>
                setForm((value) => ({
                  ...value,
                  branchName: event.target.value,
                }))
              }
              placeholder="e.g. Westlands"
            />
          </label>
        </div>
        {profile && (
          <div className="bank-destination-summary">
            <Building2 size={16} />
            <span>
              <strong>{profile.bank_name}</strong>
              <small>
                {profile.account_name} · {profile.masked_account} · Paybill{" "}
                {profile.mpesa_paybill}
              </small>
            </span>
          </div>
        )}
        {notice && (
          <div className={`bank-settings-notice ${notice.type}`}>
            {notice.type === "error" ? (
              <AlertTriangle size={15} />
            ) : (
              <CheckCircle2 size={15} />
            )}
            <span>{notice.text}</span>
          </div>
        )}
        <div className="modal-actions">
          <button className="primary-button" disabled={busy}>
            <Save size={15} />
            {busy ? "Saving…" : "Save bank destination"}
          </button>
        </div>
      </form>
    </Panel>
  );
}
