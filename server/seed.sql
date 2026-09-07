INSERT INTO organizations (id,name,slug,business_type,status,plan,currency,timezone,email,phone)
VALUES ('11111111-1111-1111-1111-111111111111','Alpha Properties','alpha-properties','property_manager','active','business','KES','Africa/Nairobi','admin@alpha.test','0700000000')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO users (id,email,password_hash,first_name,last_name,phone)
VALUES ('22222222-2222-2222-2222-222222222222','alex@alpha.test','dev-only','Alex','N.','0712000000')
ON CONFLICT (email) DO NOTHING;

INSERT INTO organization_users (organization_id,user_id,role)
VALUES ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','admin')
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
