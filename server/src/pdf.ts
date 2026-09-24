import PDFDocument from 'pdfkit';

type InvoicePdfInput={
  organization:string;tenant:string;property:string;unit:string;invoiceNumber:string;
  issuedOn:string;dueOn:string;items:Array<{description:string;amount:number}>;total:number;
};

function collect(build:(doc:PDFKit.PDFDocument)=>void){
  return new Promise<Buffer>((resolve,reject)=>{
    const doc=new PDFDocument({size:'A4',margin:54}),chunks:Buffer[]=[];
    doc.on('data',(chunk:Buffer)=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
    build(doc);doc.end();
  });
}

function header(doc:PDFKit.PDFDocument,organization:string,label:string){
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(20).text('PropOS');
  doc.fillColor('#667085').font('Helvetica').fontSize(9).text('by Polyizon');
  doc.moveDown(1.4).fillColor('#111827').font('Helvetica-Bold').fontSize(17).text(label);
  doc.fillColor('#667085').font('Helvetica').fontSize(10).text(organization);
  doc.moveDown(1.2).strokeColor('#e5e7eb').moveTo(54,doc.y).lineTo(541,doc.y).stroke().moveDown(1.2);
}

export function agreementPdf(input:{organization:string;property:string;unit:string;tenant:string;leaseNumber:string;startDate:string;endDate:string;body:string}){
  return collect(doc=>{
    header(doc,input.organization,'Tenancy agreement');
    doc.fillColor('#344054').fontSize(10).text(`Tenant: ${input.tenant}`).text(`Property: ${input.property} · Unit ${input.unit}`).text(`Lease: ${input.leaseNumber}`).text(`Term: ${input.startDate} to ${input.endDate}`);
    doc.moveDown(1.3).fillColor('#111827').fontSize(10.5).text(input.body,{lineGap:4,align:'justify'});
    doc.moveDown(2).strokeColor('#d0d5dd').moveTo(54,doc.y).lineTo(250,doc.y).stroke().moveTo(330,doc.y).lineTo(526,doc.y).stroke();
    doc.moveDown(.5).fontSize(9).fillColor('#667085').text('Tenant signature',{continued:true,width:276}).text('Management signature');
  });
}

export function invoicePdf(input:InvoicePdfInput){
  return collect(doc=>{
    header(doc,input.organization,'Invoice');
    doc.fillColor('#344054').fontSize(10).text(`Invoice: ${input.invoiceNumber}`).text(`Tenant: ${input.tenant}`).text(`Home: ${input.property} · Unit ${input.unit}`).text(`Issued: ${input.issuedOn}`).text(`Due: ${input.dueOn}`);
    doc.moveDown(1.5).fillColor('#667085').font('Helvetica-Bold').text('DESCRIPTION',54,doc.y,{continued:true,width:365}).text('AMOUNT',{align:'right'});
    doc.moveDown(.6);
    for(const item of input.items){
      const y=doc.y;doc.strokeColor('#edf0f4').moveTo(54,y).lineTo(541,y).stroke();doc.moveDown(.7);
      doc.fillColor('#111827').font('Helvetica').text(item.description,54,doc.y,{continued:true,width:365}).text(`KES ${item.amount.toLocaleString('en-KE',{minimumFractionDigits:2})}`,{align:'right'});doc.moveDown(.7);
    }
    doc.moveDown(.8).font('Helvetica-Bold').fontSize(13).text(`Total: KES ${input.total.toLocaleString('en-KE',{minimumFractionDigits:2})}`,{align:'right'});
    doc.moveDown(2).fillColor('#667085').font('Helvetica').fontSize(9).text('This invoice is also available in your PropOS tenant portal.',{align:'center'});
  });
}
