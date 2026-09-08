INSERT INTO organizations (id,name,slug,business_type,status,plan,currency,timezone,email,phone)
VALUES ('11111111-1111-1111-1111-111111111111','Alpha Properties','alpha-properties','property_manager','active','business','KES','Africa/Nairobi','admin@alpha.test','0700000000')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO users (id,email,password_hash,first_name,last_name,phone)
VALUES ('22222222-2222-2222-2222-222222222222','alex@alpha.test','pbkdf2$210000$cG9seWl6b24tZGVtby0yMDI2$DTQ2xrV_no-o-Jz8ChY1RStCxDyYAzvoJUaYbMSu-2E','Alex','N.','0712000000')
ON CONFLICT (email) DO NOTHING;

INSERT INTO organization_users (organization_id,user_id,role)
VALUES ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','admin')
ON CONFLICT DO NOTHING;

INSERT INTO users (id,email,password_hash,first_name,last_name,phone)
VALUES
('22222222-2222-2222-2222-222222222223','grace@alpha.test','pbkdf2$210000$cG9seWl6b24tZGVtby0yMDI2$DTQ2xrV_no-o-Jz8ChY1RStCxDyYAzvoJUaYbMSu-2E','Grace','Muthoni','0712000001'),
('22222222-2222-2222-2222-222222222224','sarah@alpha.test','pbkdf2$210000$cG9seWl6b24tZGVtby0yMDI2$DTQ2xrV_no-o-Jz8ChY1RStCxDyYAzvoJUaYbMSu-2E','Sarah','Njeri','0712000002')
ON CONFLICT (email) DO NOTHING;

INSERT INTO organization_users (organization_id,user_id,role)
VALUES
('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222223','accountant'),
('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222224','property_manager')
ON CONFLICT DO NOTHING;

INSERT INTO property_owners (id,organization_id,name,email,phone)
VALUES ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','John M. Kamau','john@example.test','0722000000')
ON CONFLICT DO NOTHING;

INSERT INTO properties (id,organization_id,owner_id,name,code,property_type,address,city,county)
VALUES ('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','Greenview Apartments','GRN','residential','Kilimani','Nairobi','Nairobi')
ON CONFLICT DO NOTHING;

INSERT INTO units (id,organization_id,property_id,unit_number,unit_type,bedrooms,market_rent,deposit_amount,status)
VALUES
('55555555-5555-5555-5555-555555555551','11111111-1111-1111-1111-111111111111','44444444-4444-4444-4444-444444444444','A-12','apartment',1,32000,32000,'occupied'),
('55555555-5555-5555-5555-555555555552','11111111-1111-1111-1111-111111111111','44444444-4444-4444-4444-444444444444','B-14','apartment',2,36000,36000,'occupied'),
('55555555-5555-5555-5555-555555555553','11111111-1111-1111-1111-111111111111','44444444-4444-4444-4444-444444444444','C-05','apartment',1,32000,32000,'vacant')
ON CONFLICT DO NOTHING;

INSERT INTO rental_tenants (id,organization_id,first_name,last_name,phone,email)
VALUES
('66666666-6666-6666-6666-666666666661','11111111-1111-1111-1111-111111111111','Mercy','Wanjiku','0712348221','mercy@example.test'),
('66666666-6666-6666-6666-666666666662','11111111-1111-1111-1111-111111111111','John','Kamau','0791229088','johnk@example.test')
ON CONFLICT DO NOTHING;

INSERT INTO leases (organization_id,unit_id,tenant_id,lease_number,start_date,end_date,monthly_rent,deposit_amount,due_day,status)
VALUES
('11111111-1111-1111-1111-111111111111','55555555-5555-5555-5555-555555555551','66666666-6666-6666-6666-666666666661','LS-2041','2026-07-01','2027-06-30',32000,32000,5,'active'),
('11111111-1111-1111-1111-111111111111','55555555-5555-5555-5555-555555555552','66666666-6666-6666-6666-666666666662','LS-1881','2025-10-01','2026-09-30',36000,36000,5,'expiring')
ON CONFLICT DO NOTHING;

INSERT INTO workflow_actions (id,organization_id,action_type,title,description,amount,currency,risk_level,department,status,policy_state,policy_reasons,requested_by,assigned_to)
VALUES
('77777777-7777-7777-7777-777777777771','11111111-1111-1111-1111-111111111111','owner_payout','September distribution · Wanjiru Holdings','Owner payout for reconciled September collections',1840000,'KES','high','finance','assigned','review','["Dual approval required above KES 500K"]'::jsonb,'22222222-2222-2222-2222-222222222224','22222222-2222-2222-2222-222222222223'),
('77777777-7777-7777-7777-777777777772','11111111-1111-1111-1111-111111111111','vendor_invoice','Kamau Plumbing Ltd · WO-2183','Vendor invoice awaiting controlled approval',84500,'KES','medium','operations','pending','clear','[]'::jsonb,'22222222-2222-2222-2222-222222222224',NULL),
('77777777-7777-7777-7777-777777777773','11111111-1111-1111-1111-111111111111','deposit_refund','Kevin Mwangi · Parkline C-18','Move-out deposit refund after deductions',58000,'KES','medium','leasing','pending','clear','[]'::jsonb,'22222222-2222-2222-2222-222222222224',NULL),
('77777777-7777-7777-7777-777777777774','11111111-1111-1111-1111-111111111111','write_off','Njeri & Co. aged arrears','Write-off request for 146-day aged debt',126400,'KES','high','collections','blocked','blocked','["Segregation-of-duties conflict","Director review required"]'::jsonb,'22222222-2222-2222-2222-222222222223','22222222-2222-2222-2222-222222222223'),
('77777777-7777-7777-7777-777777777775','11111111-1111-1111-1111-111111111111','renewal_offer','Mercy Wanjiku · Greenview A-12','Renewal offer with proposed 5% rent increase',33600,'KES','low','leasing','pending','clear','[]'::jsonb,'22222222-2222-2222-2222-222222222224',NULL)
ON CONFLICT (id) DO NOTHING;
