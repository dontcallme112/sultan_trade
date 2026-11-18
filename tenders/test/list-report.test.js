import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {makeApp,listen} from './helpers.js';
import {finance} from './finance-fixture.js';
import {COMPACT_REPORT_HEADERS} from '../report.js';
const token='token:u1:boss@example.com';
test('list export contains all filtered pages, respects sort, uses only own saved confirmed finance, and has eight literal columns',async t=>{
 const m=makeApp(),server=await listen(m.app);t.after(server.close);
 await m.store.upsertLots(Array.from({length:27},(_,i)=>({source:'test',external_id:String(i),title:i===26?'=HYPERLINK("https://example.com")':'Fixture '+i,total_price:1160+i,quantity:2,extra:{unit:'шт.'}})));
 const lots=await m.store.listLots();
 await m.service.saveWorkspace('u1',lots[26].id,{finance:{...finance(),confirmedCosts:true}});
 await m.service.saveWorkspace('u2',lots[25].id,{finance:{...finance(),confirmedCosts:true}});
 await m.service.saveWorkspace('u1',lots[24].id,{finance:{...finance(),confirmedCosts:false}});
 const selected=await m.service.listReport('u1',{sort:'amount',page:2,limit:1});
 assert.equal(selected.length,27);assert.equal(selected[0].lot.budget,1186);
 const before=(await m.store.history(lots[26].id)).items.length;
 const res=await fetch(server.base+'/api/tenders/report.xlsx?sort=amount&page=2&limit=1',{headers:{authorization:'Bearer '+token}});
 assert.equal(res.status,200);assert.match(res.headers.get('content-disposition'),/tenders-report.xlsx/);
 const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await res.arrayBuffer()));
 const sheet=book.worksheets[0];assert.equal(book.worksheets.length,1);assert.equal(sheet.columnCount,8);assert.equal(sheet.rowCount,28);
 assert.deepEqual(sheet.getRow(1).values.slice(1),COMPACT_REPORT_HEADERS);
 assert.equal(sheet.getRow(2).getCell(1).value,1);assert.equal(sheet.getRow(28).getCell(1).value,27);
 assert.equal(sheet.getRow(2).getCell(2).value,'=HYPERLINK("https://example.com")');assert.equal(sheet.getRow(2).getCell(6).value,1186);
 assert.equal(typeof sheet.getRow(2).getCell(8).value,'number');assert.equal(sheet.getRow(3).getCell(8).value,'—');assert.equal(sheet.getRow(4).getCell(8).value,'—');
 sheet.eachRow(r=>r.eachCell(c=>assert.notEqual(c.type,ExcelJS.ValueType.Formula)));
 assert.equal((await m.store.history(lots[26].id)).items.length,before);
 assert.equal((await m.service.listReport('u1',{search:'Fixture 1'})).length,11);
 // filters do not alter whose saved costs can be read.
 assert.equal((await m.service.listReport('u2',{sort:'amount'}))[0].finance,null);
});
test('list report rejects guests, outsiders, admin-secret-only access, empty selection and oversized exports',async t=>{
 const m=makeApp(),server=await listen(m.app);t.after(server.close);
 for(const [options,expected] of [[{},401],[{token:'token:u2:shopper@example.com'},403],[{secret:'S3CRET'},401],[{token},422]])assert.equal((await server.call('GET','/api/tenders/report.xlsx',options)).status,expected);
 await m.store.upsertLots(Array.from({length:201},(_,i)=>({source:'test',external_id:String(i),title:'Fixture'})));
 assert.equal((await server.call('GET','/api/tenders/report.xlsx',{token})).status,422);
 assert.equal((await server.call('GET','/api/tenders/report.xlsx?availability=invalid',{token})).status,400);
});
