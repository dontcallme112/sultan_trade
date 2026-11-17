import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import {extractDocument,draftRequirements} from '../documents.js';
const input=(name,bytes)=>({name,base64:Buffer.from(bytes).toString('base64')});
const text='Не менее 16 камер\nКоличество: 16 шт.\nГарантия не менее 24 месяцев\nПоставка в течение 10 дней';
test('TXT evidence lines are verifiable and output is explicitly not AI',async()=>{
 const r=await extractDocument(input('spec.txt',text));assert.equal(r.mode,'rules_draft');assert.equal(r.ai.status,'not_connected');assert.equal(r.sha256.length,64);
 assert.ok(r.requirements.length>=3);for(const row of r.requirements)assert.ok(r.text.split('\n')[row.evidence.line-1].startsWith(row.evidence.quote));
 assert.ok(draftRequirements('Обычный текст без требований').requirements.length===0);
});
test('DOCX and XLSX extract actual text, not filenames or guessed attributes',async()=>{
 const zip=new JSZip();zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');zip.file('word/document.xml',`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`);
 const docx=await zip.generateAsync({type:'nodebuffer'});assert.ok((await extractDocument(input('spec.docx',docx))).text.includes('24 месяцев'));
 const book=new ExcelJS.Workbook();book.addWorksheet('Requirements').addRow(['Количество','16 камер','Гарантия 24 месяца']);const xlsx=await book.xlsx.writeBuffer();assert.ok((await extractDocument(input('spec.xlsx',xlsx))).text.includes('16 камер'));
});
test('PDF text is parsed using the actual PDF parser',async()=>{
 const stream='BT /F1 12 Tf 20 100 Td (Server warranty minimum 24 months, quantity 2 units.) Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
 let pdf='%PDF-1.4\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
 const start=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(x=>String(x).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
 const r=await extractDocument(input('spec.pdf',pdf));assert.ok(r.text.includes('24 months'));
});
test('invalid, huge, unsupported and scan-like documents fail explicitly',async()=>{
 await assert.rejects(extractDocument(input('scan.txt',' ')),e=>e.code==='OCR_REQUIRED');
 await assert.rejects(extractDocument(input('old.doc',text)),/Поддерживаются/);
 await assert.rejects(extractDocument(input('fake.pdf',text)),/не PDF/);
 await assert.rejects(extractDocument({name:'bad.txt',base64:'!!!'}));
 await assert.rejects(extractDocument(input('large.txt',Buffer.alloc(5*1024*1024+1))));
 const zip=new JSZip();zip.file('too-large.xml','x'.repeat(26*1024*1024));const bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
 await assert.rejects(extractDocument(input('bomb.docx',bytes)),/слишком большой/);
});
