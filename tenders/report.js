import {calculateFinance} from './finance.js';
import {calculateExtendedRating} from './suppliers.js';
import {isClosed} from './scoring.js';
const finite=v=>typeof v==='number'&&Number.isFinite(v);
export function buildTenderReport({lot,workspace,documentWorkspace,generatedAt=new Date().toISOString()}){
 const warnings=['Отчёт содержит только сохранённые данные аккаунта на момент выгрузки. Несохранённые правки не включены.','Веб-цены и наличие не подтверждают коммерческое предложение или резерв товара.','Рейтинг и совпадение параметров не являются заключением о полном соответствии.'];
 const doc=documentWorkspace.document,review=documentWorkspace.review||{};
 let finance=null,rating=null;
 if(workspace.finance?.inputs){try{finance={inputs:workspace.finance.inputs,results:calculateFinance(workspace.finance.inputs)};warnings.push(...finance.results.assumptions);}catch{warnings.push('Сохранённые финансовые данные не прошли текущую проверку. Прибыль не рассчитана.');}}
 if(finance&&finance.results.completeness!=='user_confirmed')warnings.push('Полнота финансовых данных требует проверки: расходы и право на зачёт НДС не подтверждены пользователем.');
 if(!workspace.finance?.inputs)warnings.push('Финансовый расчёт не сохранён: прибыль и минимальная цена неизвестны.');
 if(workspace.extendedRating?.inputs){try{rating=calculateExtendedRating(workspace.extendedRating.inputs);}catch{warnings.push('Расширенный рейтинг не прошёл проверку; оценка неизвестна.');}}
 if(!doc)warnings.push('Личная проверка ТЗ не сохранена. Требования не проверены.');
 if(lot.amount==null)warnings.push('Бюджет закупки неизвестен.');
 const closed=isClosed({status_raw:lot.status_raw,deadline_at:lot.deadline},Date.parse(generatedAt));
 const state=closed?'Закрыта / срок подачи истёк':lot.status_raw||'Статус неизвестен';
 if(closed)warnings.push('Закупка закрыта или срок подачи истёк. Расчёт пригоден только для анализа/теста, не для подачи заявки.');
 const supplierRows=workspace.supplierAnalysis?.results?.rows||[];
 const suppliers=supplierRows.map(r=>({...r,inputs:workspace.supplierAnalysis?.inputs?.offers?.[r.index]||null,currentPriceAgeDays: Number.isFinite(Date.parse(r.observedAt))?Math.floor((Date.parse(generatedAt)-Date.parse(r.observedAt))/86400000):null}));
 if(suppliers.some(r=>r.totalCashKzt==null))warnings.push('У части предложений неизвестна полная стоимость доставки/импорта.');
 if(suppliers.some(r=>r.currentPriceAgeDays==null||r.currentPriceAgeDays>7))warnings.push('У части предложений неизвестна дата цены или цена старше 7 дней.');
 if(doc&&suppliers.some(r=>(r.checks||[]).some(c=>c.evidence?.documentSha256&&c.evidence.documentSha256!==doc.sha256)))warnings.push('Часть параметров сравнения относится к другой версии ТЗ. Сверьте цитаты и SHA-256 перед решением.');
 if(!suppliers.length)warnings.push('Сравнение поставщиков не сохранено. Ручные предложения приведены отдельно, без полной себестоимости.');
 const requirements=(doc?.requirements||[]).map((r,index)=>({index:index+1,type:r.type,text:r.text,line:r.evidence.line,quote:r.evidence.quote,review:review[index]||{status:'unknown',value:'',url:''}}));
 return {version:1,generatedAt,lot:{id:lot.id,number:lot.number,title:lot.title,quantity:lot.quantity??null,unit:lot.extra?.unit||null,grouped:/-ОЛ-/.test(lot.number||'')||(lot.extra?.enstru||[]).length>1,characteristics:(lot.extra?.enstru||[]).length===1?lot.extra.enstru[0].short||'':'',customer:lot.customer,region:lot.region,budget:lot.amount,currency:'KZT',deadline:lot.deadline,source:lot.source,sourceUrl:lot.source_url,sourceStatus:lot.status_raw,workflow:lot.workflow,state,demo:!!lot.demo},saved:{workspaceAt:workspace.savedAt||null,documentAt:documentWorkspace.savedAt||null},document:doc?{name:doc.name,sha256:doc.sha256,revision:documentWorkspace.revision,mode:doc.mode,requirements}:null,suppliers,manualOffers:workspace.offers||[],finance,rating,baseRating:lot.rating||null,warnings:[...new Set(warnings)],audit:[...(workspace.audit||[]),...(documentWorkspace.audit||[])].sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,40),completeness:{requirements:requirements.length,reviewed:requirements.filter(r=>r.review.status!=='unknown').length,supplierComparisons:suppliers.length,financialCalculation:!!finance,ratingCoverage:rating?.coverage??null}};
}
export const COMPACT_REPORT_HEADERS=[
 'Номер по порядку','Наименование, характеристика','Единица измерения','Количество',
 'Цена за единицу на портале ГЗ','Сумма','Сумма по которой можно подать портал +20%','Чистая прибыль'
];
const money=v=>Math.round((v+Number.EPSILON)*100)/100;
export function compactReportRow(report,index=1){
 const l=report.lot,total=finite(l.budget)?l.budget:null,quantity=finite(l.quantity)&&l.quantity>0?l.quantity:null;
 const unitPrice=total!=null&&quantity!=null&&!l.grouped?money(total/quantity):null;
 const proposed=total==null?null:money(total*1.2);let profit=null;
 if(proposed!=null&&report.finance?.inputs?.confirmedCosts===true){
  try{profit=calculateFinance({...report.finance.inputs,bidGross:proposed}).netProfit;}catch{/* Unknown inputs remain blank. */}
 }
 return [index,[l.title,l.characteristics].filter(Boolean).join(' — '),l.unit,quantity,unitPrice,total,proposed,profit];
}
// Literal strings only: spreadsheet-looking input is never written as a formula.
export async function reportWorkbook(report){
 const {default:ExcelJS}=await import('exceljs');const book=new ExcelJS.Workbook();book.creator='Sultan Trade';
 const sheet=book.addWorksheet('Отчёт',{views:[{state:'frozen',ySplit:1}]});sheet.addRow(COMPACT_REPORT_HEADERS);
 sheet.addRow(compactReportRow(report).map(v=>v==null||v===''?'—':typeof v==='number'?v:String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').slice(0,32767)));
 sheet.columns.forEach((column,i)=>{column.width=[10,65,16,14,24,22,30,24][i];});
 sheet.getRow(2).height=Math.min(409,Math.max(30,Math.ceil(String(sheet.getRow(2).getCell(2).value||'').length/60)*15));
 sheet.getRow(1).height=62;sheet.getRow(1).font={bold:true};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE6EDF1'}};
 sheet.eachRow(row=>row.eachCell(cell=>{cell.alignment={vertical:'middle',wrapText:true};cell.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}};}));
 for(const c of [5,6,7,8])sheet.getColumn(c).numFmt='#,##0.00';
 sheet.pageSetup={orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0};
 return book.xlsx.writeBuffer();
}
