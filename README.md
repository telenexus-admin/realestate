# Polyizon PropOS

Polyizon PropOS is a multi-tenant property operating system for property-management companies, landlords, owners, tenants, finance teams, caretakers and vendors.

## What is implemented

### Platform operator
- SaaS control center for organizations, plans, usage and platform health
- Property-company onboarding flow
- Workspace plan and unit-limit model

### Property-company workspace
- Executive portfolio dashboard
- Properties and unit inventory
- Property owners and owner portfolio view
- Tenant CRM
- Leasing pipeline and lease register
- Collections and payment feed
- Accounting and month-end controls
- Arrears aging and collection queue
- Maintenance work orders and SLA metrics
- Digital inspection schedule
- Unified WhatsApp/SMS/email-style inbox UI
- Report center
- Polyizon AI assistant experience
- Team, roles and settings
- Responsive mobile sidebar and dark/light mode
- Global search and quick-create modal

### API and data foundation
- Express + TypeScript REST API
- PostgreSQL multi-tenant schema
- Organization-scoped users and roles
- Owners, properties, buildings and units
- Rental tenants, applications and leases
- Invoices, payments and payment allocations
- Chart of accounts, journals and journal lines
- Vendors and maintenance requests
- Inspections and utilities
- Documents and communications
- Automation rules, audit logs and SaaS subscriptions
- Tenant-scoped CRUD endpoints and dashboard/report endpoints
- Local Docker PostgreSQL stack and demo seed
- GitHub Actions build/typecheck workflow

## Architecture

```text
Polyizon Platform Operator
└── Organization / Property Management Company
    ├── Team & Roles
    ├── Property Owners
    │   └── Properties
    │       ├── Buildings / Blocks
    │       │   └── Units
    │       └── Maintenance / Inspections / Utilities
    ├── Rental Tenants
    │   └── Leases
    │       ├── Invoices
    │       └── Payments
    ├── Accounting
    ├── Communications
    ├── Automation
    └── Reports / AI
```

Business records carry `organization_id` so each subscribed company remains isolated from other companies.

## Frontend

```bash
npm install
npm run dev
```

The Vite application runs on `http://localhost:5173` by default.

## Database + API

Start PostgreSQL:

```bash
docker compose up -d postgres
```

The database initializes from `server/schema.sql` and `server/seed.sql` on the first run.

Start the API:

```bash
cd server
cp .env.example .env
npm install
npm run dev
```

API health check:

```text
GET http://localhost:4000/health
```

Local demo login payload:

```json
{
  "email": "alex@alpha.test",
  "organizationSlug": "alpha-properties"
}
```

Send it to `POST /api/auth/dev-login`, then use the returned bearer token for `/api/*` endpoints.

## Production roadmap

The repository now contains the broad operating-system foundation. Production hardening should next connect the React screens to the API, replace development login with password/passkey/MFA authentication, add PostgreSQL row-level security, implement M-Pesa Daraja callbacks and idempotency, background queues, object storage, signed documents, tenant/owner portals, automated recurring invoicing, financial posting rules, notification providers and deployment secrets.
