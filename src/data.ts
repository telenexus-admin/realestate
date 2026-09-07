export const properties = [
  {name:'Greenview Apartments', location:'Kilimani, Nairobi', type:'Residential', units:84, occupancy:94, income:'KES 2.14M', manager:'Sarah Njeri', status:'Healthy'},
  {name:'Riverside Heights', location:'Westlands, Nairobi', type:'Residential', units:120, occupancy:91, income:'KES 3.42M', manager:'James Otieno', status:'Healthy'},
  {name:'Parkline Residences', location:'Kileleshwa, Nairobi', type:'Residential', units:96, occupancy:88, income:'KES 2.63M', manager:'Miriam Wambui', status:'Watch'},
  {name:'The Junction Offices', location:'Upper Hill, Nairobi', type:'Commercial', units:42, occupancy:98, income:'KES 4.06M', manager:'Eric Maina', status:'Healthy'},
  {name:'Sunrise Student Living', location:'Juja, Kiambu', type:'Student housing', units:180, occupancy:93, income:'KES 1.87M', manager:'Faith Chebet', status:'Healthy'},
  {name:'Mombasa Road Logistics', location:'Embakasi, Nairobi', type:'Warehouse', units:18, occupancy:83, income:'KES 1.21M', manager:'David Kilonzo', status:'Watch'},
];

export const units = Array.from({length:24}, (_,i)=>({
  unit:`${String.fromCharCode(65 + Math.floor(i/8))}-${String(i%8+1).padStart(2,'0')}`,
  property:i<8?'Greenview Apartments':i<16?'Riverside Heights':'Parkline Residences',
  type:i%3===0?'2 Bedroom':i%3===1?'1 Bedroom':'Bedsitter',
  rent:i%3===0?'KES 42,000':i%3===1?'KES 32,000':'KES 18,000',
  status:i===3||i===11?'Maintenance':i===6||i===19?'Vacant':'Occupied',
  tenant:i===6||i===19?'—':['Mercy Wanjiku','Brian Kiptoo','Alice Njeri','John Kamau','Faith Achieng','Kevin Mutua'][i%6]
}));

export const tenants = [
  ['Mercy Wanjiku','Greenview · A-12','0712 348 221','KES 32,000','KES 0','Good standing'],
  ['Brian Kiptoo','Riverside · B-04','0722 101 822','KES 24,500','KES 0','Good standing'],
  ['Alice Njeri','Parkline · C-18','0704 551 913','KES 18,000','KES 9,000','Partial'],
  ['John Kamau','Greenview · B-14','0791 229 088','KES 36,000','KES 72,000','Overdue'],
  ['Faith Achieng','Riverside · A-09','0744 711 205','KES 28,000','KES 0','Good standing'],
  ['Kevin Mutua','Greenview · C-01','0718 400 327','KES 40,000','KES 40,000','Overdue'],
];

export const owners = [
  ['John M. Kamau','3 properties','208 units','KES 5.84M','KES 4.96M','95%'],
  ['Mary Wanjiku','2 properties','132 units','KES 3.17M','KES 2.81M','92%'],
  ['Riverside Holdings','1 property','120 units','KES 3.42M','KES 3.01M','91%'],
  ['Juja Living Ltd','1 property','180 units','KES 1.87M','KES 1.69M','93%'],
];

export const leases = [
  ['LS-2041','Mercy Wanjiku','Greenview · A-12','01 Jul 2026','30 Jun 2027','KES 32,000','Active'],
  ['LS-1984','Brian Kiptoo','Riverside · B-04','01 Jan 2026','31 Dec 2026','KES 24,500','Active'],
  ['LS-1902','Alice Njeri','Parkline · C-18','15 Oct 2025','14 Oct 2026','KES 18,000','Expiring'],
  ['LS-1881','John Kamau','Greenview · B-14','01 Oct 2025','30 Sep 2026','KES 36,000','Expiring'],
];

export const payments = [
  ['MP-902184','Mercy Wanjiku','Greenview · A-12','KES 32,000','M-Pesa','08 Sep, 09:42','Paid'],
  ['BK-218400','Brian Kiptoo','Riverside · B-04','KES 24,500','Bank','08 Sep, 08:11','Paid'],
  ['MP-902001','Alice Njeri','Parkline · C-18','KES 9,000','M-Pesa','07 Sep, 19:22','Partial'],
  ['MP-901882','Faith Achieng','Riverside · A-09','KES 28,000','M-Pesa','07 Sep, 16:04','Paid'],
  ['CS-1104','Kevin Mutua','Greenview · C-01','KES 5,000','Cash','06 Sep, 11:16','Partial'],
];

export const arrears = [
  ['John Kamau','Greenview · B-14','42 days','KES 72,000','31–60 days','Escalated'],
  ['Kevin Mutua','Greenview · C-01','34 days','KES 40,000','31–60 days','Reminder sent'],
  ['Dennis Kibet','Parkline · A-03','18 days','KES 26,000','8–30 days','Reminder sent'],
  ['Anne Moraa','Riverside · C-11','67 days','KES 81,500','61–90 days','Payment plan'],
  ['Peter Mwangi','Sunrise · S-44','96 days','KES 24,000','90+ days','Review'],
];

export const workOrders = [
  ['WO-2183','Water leakage — Kitchen','Greenview · A-14','Urgent','Kamau Plumbing','2h 14m','In progress'],
  ['WO-2179','Broken corridor light','Riverside · Floor 3','Medium','BrightSpark Electrical','6h 40m','Assigned'],
  ['WO-2172','Window lock replacement','Parkline · C-09','Low','Internal team','1d 4h','Scheduled'],
  ['WO-2168','No hot water','Greenview · B-02','High','Kamau Plumbing','1d 8h','Overdue'],
  ['WO-2152','Lift door sensor','The Junction Offices','High','Elevate Kenya','2d 3h','Overdue'],
];

export const inspections = [
  ['IN-448','Move-in inspection','Greenview · C-05','Today · 14:00','Sarah Njeri','Scheduled'],
  ['IN-447','Routine inspection','Riverside · B-12','Today · 16:30','James Otieno','Scheduled'],
  ['IN-441','Move-out inspection','Parkline · A-07','07 Sep · 11:00','Miriam Wambui','Awaiting review'],
  ['IN-438','Routine inspection','Sunrise · S-21','06 Sep · 09:30','Faith Chebet','Completed'],
];

export const conversations = [
  {name:'Jane Wanjiku', meta:'Greenview · A-12', channel:'WhatsApp', preview:'The water pressure is very low again.', time:'2m', unread:true},
  {name:'Brian Kiptoo', meta:'Riverside · B-04', channel:'SMS', preview:'Thanks, I have received the receipt.', time:'21m', unread:false},
  {name:'Kamau Plumbing Ltd', meta:'Vendor', channel:'WhatsApp', preview:'Technician is on the way to A-14.', time:'34m', unread:true},
  {name:'Mary Wanjiku', meta:'Property owner', channel:'Email', preview:'Please send the August owner statement.', time:'1h', unread:true},
];
