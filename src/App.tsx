import { useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  FileBarChart,
  Gauge,
  Layers3,
  Menu,
  MessagesSquare,
  MessageSquareWarning,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  UserCheck,
  Users,
  WalletCards,
  Wrench,
  X,
} from "lucide-react";
import { properties, tenants, units } from "./data";
import { OverviewPage } from "./pages/dashboard";
import {
  AccountingPage,
  ArrearsPage,
  LeasingPage,
  OwnersPage,
} from "./pages/portfolio";
import {
  AIAssistantPage,
  InboxPage,
  InspectionsPage,
  TeamPage,
} from "./pages/operations";
import {
  QuickAddModal,
  SimpleMaintenancePage,
  SimplePropertiesPage,
  SimpleReportsPage,
  SimpleTenantsPage,
  SimpleUnitsPage,
} from "./pages/simple-pages";
import BillingPage from "./pages/billing-page";
import AccountSettings from "./pages/account-settings";
import { ComplaintsPage, VisitorsPage } from "./pages/community-pages";
import { api, type BillingContext } from "./api";
import { OperatorPage } from "./pages/operator";
import {
  AutomationsPage,
  DocumentsPage,
  PortalsPage,
  UtilitiesPage,
  VendorsPage,
} from "./pages/extras";
import { CommandCenterPage } from "./pages/command";
import {
  LeaseWorkspacePage,
  PaymentDetailPage,
  PropertyProfilePage,
  TenantProfilePage,
  WorkOrderDetailPage,
} from "./pages/details";
import {
  DocumentDetailPage,
  InspectionDetailPage,
  InvoiceWorkspacePage,
  MpesaReconciliationPage,
  OrganizationDetailPage,
  OwnerProfilePage,
  UnitProfilePage,
  VendorProfilePage,
} from "./pages/deep-details";
import {
  ApplicationWorkspace,
  BankReconciliationWorkspace,
  CollectionsCaseWorkspace,
  DepositLedgerWorkspace,
  MoveInWorkspace,
  MoveOutWorkspace,
  OwnerDistributionWorkspace,
} from "./pages/deepops";
import {
  AccessReviewWorkspace,
  ApprovalCenter,
  AuditExplorer,
  NotificationCenter,
} from "./pages/deepadmin";
import {
  BudgetingWorkspace,
  ExpenseApprovalWorkspace,
  IncidentCenterWorkspace,
  ProcurementWorkspace,
  RenewalComposerWorkspace,
  ServiceChargeWorkspace,
  SupportConsoleWorkspace,
} from "./pages/enterprise";
import {
  AssetAcquisitionWorkspace,
  CapitalProjectsWorkspace,
  ComplianceCenter,
  InsuranceClaimsWorkspace,
  MigrationCenter,
  PolicyEngineWorkspace,
  TaxWithholdingWorkspace,
  ValuationWorkspace,
} from "./pages/enterprise2";
import CommunicationPage from "./pages/communication-page";

const navigation = [
  { label: "Dashboard", page: "Overview", icon: Gauge },
  { label: "Properties", page: "Properties", icon: Building2 },
  { label: "Units", page: "Units", icon: Layers3 },
  { label: "Tenants", page: "Tenants", icon: Users },
  { label: "Communication", page: "Communication", icon: MessagesSquare },
  { label: "Visitors", page: "Visitors", icon: UserCheck },
  { label: "Complaints", page: "Complaints", icon: MessageSquareWarning },
  { label: "Bills", page: "Collections", icon: WalletCards },
  { label: "Maintenance", page: "Maintenance", icon: Wrench, badge: 7 },
  { label: "Reports", page: "Reports", icon: FileBarChart },
  { label: "Settings", page: "Settings", icon: Settings },
] as const;

const commandItems = [
  ["Page", "Dashboard", "See today’s rent, occupancy and tasks", "Overview"],
  ["Page", "Bills", "Water readings, invoices and payments", "Collections"],
  ["Page", "Maintenance", "View repair requests", "Maintenance"],
  ["Page", "Reports", "View property reports", "Reports"],
] as const;

const pageNames: Record<string, string> = {
  Overview: "Dashboard",
  Collections: "Bills",
  "Tenant 360": "Tenant Details",
  "Property Profile": "Property Details",
  "Unit Profile": "Unit Details",
  "Payment Detail": "Payment Details",
  "Work Order Detail": "Repair Details",
  "M-Pesa Reconciliation": "Match M-Pesa Payments",
};

const groups: Record<string, string> = {
  "Platform Console": "Platform",
  "Organization Detail": "Platform",
  "Support Console": "Platform",
  "Incident Center": "Platform",
  Properties: "Portfolio",
  Units: "Portfolio",
  Owners: "Portfolio",
  Tenants: "Portfolio",
  Leasing: "Portfolio",
  "Property Profile": "Portfolio",
  "Unit Profile": "Portfolio",
  "Tenant 360": "Portfolio",
  "Owner Profile": "Portfolio",
  "Lease Workspace": "Portfolio",
  "Application Workspace": "Portfolio",
  "Move-in Workspace": "Portfolio",
  "Move-out Workspace": "Portfolio",
  Collections: "Finance",
  "M-Pesa Reconciliation": "Finance",
  Accounting: "Finance",
  Arrears: "Finance",
  "Invoice Workspace": "Finance",
  "Payment Detail": "Finance",
  "Deposit Ledger": "Finance",
  "Collections Case": "Finance",
  "Bank Reconciliation": "Finance",
  "Owner Distribution": "Finance",
  "Tax & Withholding": "Finance",
  Maintenance: "Operations",
  Visitors: "Operations",
  Complaints: "Operations",
  Communication: "Operations",
  Inspections: "Operations",
  Utilities: "Operations",
  Vendors: "Operations",
  Documents: "Operations",
  Inbox: "Operations",
  Automations: "Operations",
  "Work Order Detail": "Operations",
  "Vendor Profile": "Operations",
  "Inspection Detail": "Operations",
  "Document Detail": "Operations",
  "Approval Center": "Governance",
  "Audit Explorer": "Governance",
  "Notification Center": "Governance",
  "Access Review": "Governance",
  "Policy Engine": "Governance",
  "Property Budgeting": "Enterprise",
  "Service Charge & CAM": "Enterprise",
  Procurement: "Enterprise",
  "Renewal Composer": "Enterprise",
  "Expense Approval": "Enterprise",
  "Asset Transactions": "Enterprise",
  Valuation: "Enterprise",
  "Capital Projects": "Enterprise",
  "Insurance & Claims": "Enterprise",
  "Compliance Center": "Enterprise",
  "Migration Center": "Enterprise",
  Reports: "Intelligence",
  "AI Assistant": "Intelligence",
  Portals: "Experience",
};

export default function App() {
  const [dark, setDark] = useState(false),
    [mobileOpen, setMobileOpen] = useState(false),
    [page, setPage] = useState("Overview"),
    [addOpen, setAddOpen] = useState(false),
    [globalSearch, setGlobalSearch] = useState(""),
    [refreshKey, setRefreshKey] = useState(0),
    [session, setSession] = useState<BillingContext | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const navigate = (target: string) => {
    setPage(target);
    setMobileOpen(false);
    setGlobalSearch("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") {
        setGlobalSearch("");
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    api
      .billingContext()
      .then(setSession)
      .catch(() => {});
  }, []);
  const searchResults = useMemo(() => {
    if (!globalSearch.trim()) return [];
    const q = globalSearch.toLowerCase();
    const entities = [
      ...properties.map((p) => ({
        type: "Property",
        name: p.name,
        meta: p.location,
        target: "Property Profile",
      })),
      ...tenants.map((t) => ({
        type: "Tenant",
        name: t[0],
        meta: t[1],
        target: "Tenant 360",
      })),
      ...units.map((u) => ({
        type: "Unit",
        name: u.unit,
        meta: u.property,
        target: "Unit Profile",
      })),
    ];
    const commands = commandItems.map((c) => ({
      type: c[0],
      name: c[1],
      meta: c[2],
      target: c[3],
    }));
    return [...commands, ...entities]
      .filter((x) =>
        (x.name + " " + x.meta + " " + x.type).toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [globalSearch]);
  const onAdd = () => setAddOpen(true);
  function content() {
    switch (page) {
      case "Platform Console":
        return <OperatorPage onAdd={onAdd} />;
      case "Command Center":
        return <CommandCenterPage />;
      case "Properties":
        return <SimplePropertiesPage onAdd={onAdd} refreshKey={refreshKey} />;
      case "Units":
        return <SimpleUnitsPage onAdd={onAdd} refreshKey={refreshKey} />;
      case "Owners":
        return <OwnersPage onAdd={onAdd} onNavigate={navigate} />;
      case "Tenants":
        return <SimpleTenantsPage onAdd={onAdd} refreshKey={refreshKey} />;
      case "Communication":
        return <CommunicationPage />;
      case "Visitors":
        return <VisitorsPage />;
      case "Complaints":
        return <ComplaintsPage />;
      case "Leasing":
        return <LeasingPage onAdd={onAdd} onNavigate={navigate} />;
      case "Property Profile":
        return <PropertyProfilePage />;
      case "Unit Profile":
        return <UnitProfilePage />;
      case "Tenant 360":
        return <TenantProfilePage />;
      case "Owner Profile":
        return <OwnerProfilePage />;
      case "Lease Workspace":
        return <LeaseWorkspacePage />;
      case "Invoice Workspace":
        return <InvoiceWorkspacePage />;
      case "Payment Detail":
        return <PaymentDetailPage />;
      case "Work Order Detail":
        return <WorkOrderDetailPage />;
      case "Vendor Profile":
        return <VendorProfilePage />;
      case "Inspection Detail":
        return <InspectionDetailPage />;
      case "Document Detail":
        return <DocumentDetailPage />;
      case "Organization Detail":
        return <OrganizationDetailPage />;
      case "Application Workspace":
        return <ApplicationWorkspace />;
      case "Move-in Workspace":
        return <MoveInWorkspace />;
      case "Move-out Workspace":
        return <MoveOutWorkspace />;
      case "Deposit Ledger":
        return <DepositLedgerWorkspace />;
      case "Collections Case":
        return <CollectionsCaseWorkspace />;
      case "Bank Reconciliation":
        return <BankReconciliationWorkspace />;
      case "Owner Distribution":
        return <OwnerDistributionWorkspace />;
      case "Property Budgeting":
        return <BudgetingWorkspace />;
      case "Service Charge & CAM":
        return <ServiceChargeWorkspace />;
      case "Procurement":
        return <ProcurementWorkspace />;
      case "Renewal Composer":
        return <RenewalComposerWorkspace />;
      case "Expense Approval":
        return <ExpenseApprovalWorkspace />;
      case "Asset Transactions":
        return <AssetAcquisitionWorkspace />;
      case "Valuation":
        return <ValuationWorkspace />;
      case "Capital Projects":
        return <CapitalProjectsWorkspace />;
      case "Insurance & Claims":
        return <InsuranceClaimsWorkspace />;
      case "Compliance Center":
        return <ComplianceCenter />;
      case "Tax & Withholding":
        return <TaxWithholdingWorkspace />;
      case "Policy Engine":
        return <PolicyEngineWorkspace />;
      case "Migration Center":
        return <MigrationCenter />;
      case "Support Console":
        return <SupportConsoleWorkspace />;
      case "Incident Center":
        return <IncidentCenterWorkspace />;
      case "Approval Center":
        return <ApprovalCenter />;
      case "Audit Explorer":
        return <AuditExplorer />;
      case "Notification Center":
        return <NotificationCenter />;
      case "Access Review":
        return <AccessReviewWorkspace />;
      case "Collections":
        return <BillingPage onAdd={onAdd} refreshKey={refreshKey} />;
      case "M-Pesa Reconciliation":
        return <MpesaReconciliationPage />;
      case "Accounting":
        return <AccountingPage onAdd={onAdd} onNavigate={navigate} />;
      case "Arrears":
        return <ArrearsPage onAdd={onAdd} onNavigate={navigate} />;
      case "Maintenance":
        return <SimpleMaintenancePage onAdd={onAdd} refreshKey={refreshKey} />;
      case "Inspections":
        return <InspectionsPage onAdd={onAdd} />;
      case "Utilities":
        return <UtilitiesPage />;
      case "Vendors":
        return <VendorsPage />;
      case "Documents":
        return <DocumentsPage />;
      case "Inbox":
        return <InboxPage onAdd={onAdd} />;
      case "Automations":
        return <AutomationsPage />;
      case "Portals":
        return <PortalsPage />;
      case "Reports":
        return <SimpleReportsPage />;
      case "AI Assistant":
        return <AIAssistantPage />;
      case "Team & roles":
        return <TeamPage />;
      case "Settings":
        return <AccountSettings />;
      default:
        return <OverviewPage />;
    }
  }
  const group = groups[page];
  const addPages = [
    "Properties",
    "Units",
    "Tenants",
    "Collections",
    "Maintenance",
  ];
  const canAdd = addPages.includes(page) && session?.role !== "caretaker";
  const visibleNavigation =
    session?.role === "caretaker"
      ? navigation.filter((item) =>
          [
            "Overview",
            "Properties",
            "Units",
            "Visitors",
            "Complaints",
            "Collections",
            "Maintenance",
            "Settings",
          ].includes(item.page),
        )
      : navigation;
  const userName = session
      ? `${session.user.first_name} ${session.user.last_name}`
      : "User",
    initials = userName
      .split(" ")
      .map((v) => v[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  return (
    <div className={dark ? "app dark" : "app"}>
      <aside className={mobileOpen ? "sidebar open" : "sidebar"}>
        <div className="brand-row">
          <div className="brand-mark">
            <Building2 size={20} />
          </div>
          <div>
            <strong>Polyizon</strong>
            <span>Property Manager</span>
          </div>
          <button
            className="icon-button mobile-close"
            onClick={() => setMobileOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <nav>
          {visibleNavigation.map((item) => (
            <button
              key={item.label}
              onClick={() => navigate(item.page)}
              className={`nav-item ${page === item.page ? "active" : ""}`}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {"badge" in item && item.badge && <em>{item.badge}</em>}
            </button>
          ))}
        </nav>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="left-tools">
            <button
              className="icon-button menu"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div className="global-search">
              <Search size={18} />
              <input
                ref={searchRef}
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Search properties, units or tenants"
              />
              <kbd>⌘ K</kbd>
              {searchResults.length > 0 && (
                <div className="search-results command-results">
                  {searchResults.map((r, i) => (
                    <button key={i} onClick={() => navigate(r.target)}>
                      <span>{r.type}</span>
                      <strong>{r.name}</strong>
                      <small>{r.meta}</small>
                      <ChevronRight size={13} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="top-actions">
            <button className="icon-button" onClick={() => setDark(!dark)}>
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {canAdd && page !== "Collections" && (
              <button className="add-button" onClick={onAdd}>
                <Plus size={17} /> Add
              </button>
            )}
            <button className="profile" onClick={() => navigate("Settings")}>
              <div className="profile-avatar">{initials}</div>
              <div>
                <strong>{userName}</strong>
                <span>{session?.role?.replace("_", " ") || "Account"}</span>
              </div>
              <ChevronDown size={14} />
            </button>
          </div>
        </header>
        <div className="context-bar">
          <button onClick={() => navigate("Overview")}>Home</button>
          <ChevronRight size={12} />
          {group && page !== "Overview" && (
            <>
              <span>{group}</span>
              <ChevronRight size={12} />
            </>
          )}
          <strong>{pageNames[page] || page}</strong>
        </div>
        <section className="content">{content()}</section>
      </main>
      {mobileOpen && (
        <button className="scrim" onClick={() => setMobileOpen(false)} />
      )}{" "}
      {addOpen && canAdd && (
        <QuickAddModal
          page={
            page as
              "Properties" | "Units" | "Tenants" | "Collections" | "Maintenance"
          }
          onClose={() => setAddOpen(false)}
          onSaved={() => setRefreshKey((key) => key + 1)}
        />
      )}
    </div>
  );
}
