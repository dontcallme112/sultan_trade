import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {buildTenderReport,reportWorkbook,compactReportRow,COMPACT_REPORT_HEADERS} from '../report.js';
import {makeApp,listen} from './helpers.js';
import {finance} from './finance-fixture.js';
const date='2026-11-17T12:00:00Z';
const base=()=>({lot:{id:'fixture',number:'R-1',title:'Report fixture',amount:null,deadline:null,status_raw:null,workflow:'new'},workspace:{offers:[],finance:null},documentWorkspace:{document:null,review:{}},generatedAt:date});
test('missing data stays unknown; financial results are recomputed from saved inputs, not a cached profit',()=>{
 const empty=buildTenderReport(base());assert.equal(empty.finance,null);assert.equal(empty.lot.budget,null);assert.ok(empty.warnings.some(x=>x.includes('прибыль и минимальная цена неизвестны')));
 const input=base();input.workspace.finance={inputs:finance(),results:{netProfit:999999}};const report=buildTenderReport(input);assert.equal(report.finance.results.netProfit,86);assert.ok(report.warnings.some(x=>x.includes('не подтверждены пользователем')));
});
test('closed lots, stale prices and citations from another document version remain explicit',()=>{
 const input=base();input.lot.status_raw='Закупка состоялась';input.documentWorkspace.document={name:'fixture.txt',sha256:'a'.repeat(64),mode:'rules_draft',requirements:[]};
 input.workspace.supplierAnalysis={results:{rows:[{index:0,observedAt:'2026-10-01',totalCashKzt:null,checks:[{evidence:{documentSha256:'b'.repeat(64)}}]}]}};
 const report=buildTenderReport(input);assert.equal(report.suppliers[0].currentPriceAgeDays,47);assert.ok(report.warnings.some(x=>x.includes('Закупка закрыта')));assert.ok(report.warnings.some(x=>x.includes('другой версии ТЗ')));assert.ok(report.warnings.some(x=>x.includes('старше 7 дней')));
});
test('Excel preserves numbers, unknown values and source evidence without executable spreadsheet formulas',async()=>{
 const input=base(),payload='=HYPERLINK("https://example.com", "untrusted")';input.lot.title=payload;input.lot.amount=1160;input.lot.quantity=2;input.lot.extra={unit:'шт.'};input.workspace.finance={inputs:{...finance(),confirmedCosts:true}};
 input.documentWorkspace.document={name:'fixture.txt',sha256:'a'.repeat(64),mode:'rules_draft',requirements:[{type:'parameter',text:payload,evidence:{line:1,quote:payload}}]};input.documentWorkspace.review={'0':{status:'unknown',value:'',url:''}};
 const report=buildTenderReport(input),bytes=await reportWorkbook(report),book=new ExcelJS.Workbook();await book.xlsx.load(bytes);
 assert.equal(book.worksheets.length,1);const sheet=book.getWorksheet('Отчёт');assert.equal(sheet.columnCount,8);assert.deepEqual(sheet.getRow(1).values.slice(1),COMPACT_REPORT_HEADERS);
 assert.equal(sheet.getRow(2).getCell(2).value,payload);assert.equal(sheet.getRow(2).getCell(3).value,'шт.');assert.equal(sheet.getRow(2).getCell(4).value,2);
 assert.equal(sheet.getRow(2).getCell(5).value,580);assert.equal(sheet.getRow(2).getCell(6).value,1160);assert.equal(sheet.getRow(2).getCell(7).value,1392);assert.equal(sheet.getRow(2).getCell(8).value,246);
 book.eachSheet(sheet=>sheet.eachRow(row=>row.eachCell(cell=>assert.notEqual(cell.type,ExcelJS.ValueType.Formula))));
 const zip=await JSZip.loadAsync(bytes);for(const name of Object.keys(zip.files).filter(n=>/^xl\/worksheets\/sheet\d+\.xml$/.test(n)))assert.doesNotMatch(await zip.file(name).async('string'),/<f\b/);assert.ok(!Object.keys(zip.files).some(n=>n.includes('externalLinks')||n.includes('vbaProject')));
});
test('report endpoint is protected, employee-private and read-only; Excel is a real downloadable workbook',async()=>{
 const {app,service,store}=makeApp({now:()=>Date.parse(date)});await service.sync('portal-file',[{lot_number:'REPORT-1',name_ru:'Report HTTP fixture'}]);const id=(await service.list('u1')).items[0].id;
 await service.saveWorkspace('u1',id,{finance:finance()});const before=await service.getWorkspace('u1',id),logs=await store.listLog();const http=await listen(app);try{
 assert.equal((await http.call('GET',`/api/tenders/${id}/report.json`)).status,401);
 assert.equal((await http.call('GET',`/api/tenders/${id}/report.json`,{secret:'S3CRET'})).status,401);
 const own=await http.call('GET',`/api/tenders/${id}/report.json`,{token:'token:u1:boss@example.com'});assert.equal(own.json.finance.results.netProfit,86);
 const other=await http.call('GET',`/api/tenders/${id}/report.json`,{token:'token:u2:boss@example.com'});assert.equal(other.json.finance,null);
 assert.equal((await http.call('GET','/api/tenders/missing/report.json',{token:'token:u1:boss@example.com'})).status,404);
 const baseUrlServer=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});try{
  const res=await fetch(`http://127.0.0.1:${baseUrlServer.address().port}/api/tenders/${id}/report.xlsx`,{headers:{authorization:'Bearer token:u1:boss@example.com'}});assert.equal(res.status,200);assert.match(res.headers.get('content-type'),/spreadsheetml/);assert.match(res.headers.get('content-disposition'),/attachment/);assert.equal(res.headers.get('cache-control'),'no-store');const bytes=new Uint8Array(await res.arrayBuffer());assert.equal(String.fromCharCode(...bytes.slice(0,2)),'PK');const book=new ExcelJS.Workbook();await book.xlsx.load(bytes);assert.ok(book.getWorksheet('Отчёт'));assert.equal(book.worksheets.length,1);
 }finally{await new Promise(resolve=>baseUrlServer.close(resolve));}
 assert.deepEqual(await service.getWorkspace('u1',id),before);assert.deepEqual(await store.listLog(),logs);
 }finally{await http.close();}
});

test('compact template keeps unknown fields empty and does not infer unit prices for grouped lots',async()=>{
 const empty=buildTenderReport(base());assert.deepEqual(compactReportRow(empty).slice(2),[null,null,null,null,null,null]);
 const input=base();input.lot.amount=1160;input.lot.quantity=2;input.lot.number='100-ОЛ-ЗЦП1';input.workspace.finance={inputs:finance()};
 const row=compactReportRow(buildTenderReport(input));assert.equal(row[4],null);assert.equal(row[6],1392);assert.equal(row[7],null);
 const book=new ExcelJS.Workbook();await book.xlsx.load(await reportWorkbook(empty));assert.equal(book.getWorksheet('Отчёт').getRow(2).getCell(8).value,'—');
});
