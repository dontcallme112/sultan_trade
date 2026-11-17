import {calculateFinance} from './finance.js';
import {calculateExtendedRating} from './suppliers.js';
import {isClosed} from './scoring.js';
const unknown='Неизвестно';
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const costNames={equipment:'Оборудование',delivery:'Доставка',customs:'Пошлина и сборы',installation:'Монтаж',salary:'Заработная плата',other:'Прочие расходы',reserve:'Резерв',financing:'Финансирование'};
const metricNames={revenueNet:'Выручка без НДС',costTotal:'Экономическая себестоимость',cashExpenses:'Денежные расходы до зачёта НДС',grossProfit:'Валовая прибыль',preTax:'Прибыль до КПН',corporateTax:'Расчётный КПН',netProfit:'Прогноз чистой прибыли',marginPercent:'Чистая маржа, %',roiPercent:'Рентабельность затрат, %',minimumBidGross:'Минимальная цена предложения',outputVat:'Исходящий НДС',inputVat:'Входной НДС к зачёту',vatBalance:'Баланс НДС',importVatPaid:'Импортный НДС уплачен',importVatCredit:'Импортный НДС к зачёту'};
const factorNames={activity:'Соответствие деятельности',profit:'Прибыль',margin:'Рентабельность',availability:'Наличие оборудования',complexity:'Простота исполнения',delivery:'Срок поставки',licenses:'Лицензии',risk:'Финансовые и договорные риски',reliability:'Достоверность данных'};
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
 return {version:1,generatedAt,lot:{id:lot.id,number:lot.number,title:lot.title,customer:lot.customer,region:lot.region,budget:lot.amount,currency:'KZT',deadline:lot.deadline,source:lot.source,sourceUrl:lot.source_url,sourceStatus:lot.status_raw,workflow:lot.workflow,state,demo:!!lot.demo},saved:{workspaceAt:workspace.savedAt||null,documentAt:documentWorkspace.savedAt||null},document:doc?{name:doc.name,sha256:doc.sha256,revision:documentWorkspace.revision,mode:doc.mode,requirements}:null,suppliers,manualOffers:workspace.offers||[],finance,rating,baseRating:lot.rating||null,warnings:[...new Set(warnings)],audit:[...(workspace.audit||[]),...(documentWorkspace.audit||[])].sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,40),completeness:{requirements:requirements.length,reviewed:requirements.filter(r=>r.review.status!=='unknown').length,supplierComparisons:suppliers.length,financialCalculation:!!finance,ratingCoverage:rating?.coverage??null}};
}
const workflowNames={new:'Новый',analysis:'На анализе',review:'На анализе',interesting:'Интересный',preparing:'Готовим заявку',participating:'Участвуем',won:'Выигран',lost:'Проигран',rejected:'Отклонён'};
const missingNames={delivery:'Доставка',customs:'Таможенные расходы',customs_value:'Таможенная стоимость',requirements:'Технические требования',availability:'Наличие товара',delivery_date:'Срок поставки'};
const modes={unknown:'Неизвестно',fixed:'Сумма в KZT',weight:'Вес × тариф + сбор',none:'Не применяется',import:'Импорт по ставкам',rules_draft:'Предварительный поиск фраз',ai_draft:'AI-черновик с проверенными цитатами'};
const statuses={unknown:'Не проверено',matches:'Соответствует по введённому источнику',partial:'Частично',fails:'Не соответствует'};
// All untrusted values are string/number cells; never Excel formulas or active hyperlinks.
export async function reportWorkbook(report){
 const {default:ExcelJS}=await import('exceljs');const book=new ExcelJS.Workbook();book.creator='Sultan Trade';book.created=new Date(report.generatedAt);
 const value=v=>v==null||v===''?unknown:typeof v==='boolean'?(v?'Да':'Нет'):finite(v)?v:String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').slice(0,32767);
 const sheet=(name,headers,rows)=>{
  const s=book.addWorksheet(name,{views:[{state:'frozen',ySplit:1}]});s.addRow(headers);
  for(const row of rows)s.addRow(row.map(value));
  s.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};s.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF365565'}};
  s.columns.forEach((c,i)=>{c.width=i===0?32:Math.min(65,i===1?60:36);});
  s.eachRow(r=>r.eachCell(c=>{c.alignment={vertical:'top',wrapText:true};if(typeof c.value==='number')c.numFmt='#,##0.00';}));
  if(s.rowCount>1)s.autoFilter={from:{row:1,column:1},to:{row:s.rowCount,column:headers.length}};
  s.pageSetup={orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0};return s;
 };
 sheet('Сводка',['Поле','Сохранённые данные'],[
  ['Сформирован (UTC)',report.generatedAt],['Номер',report.lot.number],['Закупка',report.lot.title],['Заказчик',report.lot.customer],['Регион',report.lot.region],['Бюджет, KZT',report.lot.budget],['Срок подачи',report.lot.deadline],['Состояние источника',report.lot.state],['Рабочий статус',workflowNames[report.lot.workflow]||report.lot.workflow],['Источник',report.lot.sourceUrl||report.lot.source],['Демо',report.lot.demo],['Рабочие данные сохранены',report.saved.workspaceAt],['Проверка ТЗ сохранена',report.saved.documentAt],['Документ',report.document?.name],['SHA-256',report.document?.sha256],['Режим разбора',modes[report.document?.mode]||report.document?.mode],['Требований',report.completeness.requirements],['Отмечено вручную',report.completeness.reviewed],['Сравнивается предложений',report.completeness.supplierComparisons],['Финансовый расчёт сохранён',report.completeness.financialCalculation],['Расширенный рейтинг',report.rating?.score],['Полнота расширенного рейтинга, %',report.rating?.coverage!=null?report.rating.coverage*100:null],['Базовый рейтинг',report.baseRating?.score]
 ]);
 sheet('Требования',['№','Требование','Строка','Цитата из ТЗ','Ручная оценка','Параметр модели','Источник параметра'],(report.document?.requirements||[]).map(r=>[r.index,r.text,r.line,r.quote,statuses[r.review.status],r.review.value,r.review.url]));
 sheet('Поставщики',['Поставщик','Модель','Цена единицы','Валюта','Курс в KZT','Дата курса','Дата цены','Возраст цены, дней','Требуется','Купить с учётом упаковки','Товар, KZT','Доставка, KZT','Пошлина и сборы, KZT','Импортный НДС, KZT','Денежные расходы, KZT','Источник','Неизвестные данные','Предупреждения'],report.suppliers.map(r=>[r.supplier,r.model,r.unitPrice,r.currency,r.currency==='KZT'?1:r.inputs?.fxRate,r.fxDate,r.observedAt,r.currentPriceAgeDays,r.quantity,r.purchaseQuantity,r.goodsKzt,r.shippingKzt,r.customs?r.customs.duty+r.customs.fees:null,r.customs?.importVat,r.totalCashKzt,r.url,(r.unknown||[]).map(k=>missingNames[k]||k).join(', '),(r.warnings||[]).join('\n')]));
 sheet('Сопоставление',['Поставщик','Модель','Параметр','Условие','Требуется','Единица','Фактически','Статус','Источник фактического значения','Цитата требования','SHA-256 ТЗ'],report.suppliers.flatMap(r=>(r.checks||[]).map(c=>[r.supplier,r.model,c.key,({eq:'Равно',min:'Не менее',max:'Не более'})[c.op]||c.op,c.value,c.unit,c.actual,statuses[c.status],c.source,c.evidence?.quote,c.evidence?.documentSha256])));
 sheet('Доставка и импорт',['Поставщик','Доставка: метод','Доставка: сумма KZT','Вес партии кг','Тариф KZT/кг','Сбор перевозчика KZT','Таможня: режим','Основание / ТН ВЭД','Период с','Период по','До границы KZT','Корректировка стоимости KZT','Пошлина %','Сборы KZT','Дополнения базы НДС KZT','Импортный НДС %'],report.suppliers.map(r=>{const o=r.inputs;return [r.supplier,modes[o?.shipping?.mode]||o?.shipping?.mode,o?.shipping?.amount,o?.shipping?.weightKg,o?.shipping?.rateKztKg,o?.shipping?.fixedKzt,modes[o?.customs?.mode]||o?.customs?.mode,o?.customs?.basis||o?.customs?.reason,o?.customs?.from,o?.customs?.to,o?.customs?.freightToBorder,o?.customs?.valueAdjustment,o?.customs?.dutyPercent,o?.customs?.feesKzt,o?.customs?.vatBaseAdditions,o?.customs?.vatPercent];}));
 sheet('Ручные предложения',['Поставщик','Модель','Цена','Валюта','Количество','Курс в KZT','Дата курса','Товар, KZT','Дата цены','Источник','Примечания'],report.manualOffers.map(o=>[o.supplier,o.model,o.unitPrice,o.currency,o.quantity,o.fxRate,o.fxDate,o.totalKzt,o.observedAt,o.url,o.notes]));
 const financial=Object.entries(metricNames).map(([key,name])=>[name,report.finance?.results[key]]);
 financial.unshift(['Дата расчёта',report.finance?.inputs.date],['Предложение с НДС, KZT',report.finance?.inputs.bidGross],['Плательщик НДС',report.finance?.inputs.vatPayer],['НДС, %',report.finance?.inputs.tax?.vatPercent],['КПН, %',report.finance?.inputs.tax?.citPercent],['Ставки с',report.finance?.inputs.tax?.from],['Ставки по',report.finance?.inputs.tax?.to],['Все расходы подтверждены пользователем',report.finance?.inputs.confirmedCosts]);
 for(const [key,name] of Object.entries(costNames))financial.push([name+' — с НДС',report.finance?.inputs.costs?.[key]?.gross]);
 sheet('Финансы',['Показатель','Значение / KZT'],financial);
 sheet('Рейтинг',['Критерий','Вес','Оценка','Основание'],(report.rating?.factors||[]).map(f=>[factorNames[f.key]||f.key,f.weight,f.score,f.evidence||f.reason]));
 sheet('Допущения',['№','Допущения и неопределённость'],report.warnings.map((w,i)=>[i+1,w]));
 sheet('Аудит',['Время UTC','Действие','SHA-256 документа'],report.audit.map(a=>[a.at,({save_workspace:'Сохранение рабочих данных',save_document:'Сохранение ТЗ',save_review:'Сохранение проверки'})[a.action]||a.action,a.sha256]));
 return book.xlsx.writeBuffer();
}
