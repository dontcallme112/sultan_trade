const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const num = (v, name, max=1e12) => { if(v === '' || v == null || !Number.isFinite(Number(v)) || Number(v)<0 || Number(v)>max) fail(`Укажите корректное значение: ${name}`); return Number(v); };
const iso = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s;
const round = x => Math.round((x+Number.EPSILON)*100)/100;
export const COST_KEYS = ['equipment','delivery','customs','installation','salary','other','reserve','financing'];
export function calculateFinance(input) {
  if (!input || !iso(input.date)) fail('Укажите дату расчёта');
  const tax=input.tax;
  if(!tax || !iso(tax.from) || !iso(tax.to) || tax.from>tax.to || input.date<tax.from || input.date>tax.to) fail('Налоговые ставки не действуют на дату расчёта');
  if(typeof input.vatPayer !== 'boolean') fail('Укажите статус плательщика НДС');
  const vat=num(tax.vatPercent,'НДС',100)/100, cit=num(tax.citPercent,'КПН',99.99)/100;
  const grossRevenue=num(input.bidGross,'Цена предложения');
  const costs=COST_KEYS.map(key=>{
    const c=input.costs?.[key]; if(!c || typeof c.recoverable !== 'boolean') fail(`Заполните статью ${key}`);
    const gross=num(c.gross,key), rate=num(c.vatPercent,`НДС статьи ${key}`,100)/100;
    if(['salary','reserve'].includes(key) && rate!==0) fail('Зарплата и резерв в этой модели задаются без НДС');
    const inputVat = input.vatPayer && c.recoverable ? gross*rate/(1+rate) : 0;
    return {key,gross,net:gross-inputVat,inputVat};
  });
  const importVatPaid=num(input.importVat?.amount??0,'Импортный НДС');
  if(input.importVat && typeof input.importVat.recoverable!=='boolean')fail('Укажите право на зачёт импортного НДС');
  const importVatCredit=input.vatPayer && input.importVat?.recoverable===true?importVatPaid:0;
  const importVatCost=importVatPaid-importVatCredit;
  const sum=keys=>costs.filter(c=>keys.includes(c.key)).reduce((n,c)=>n+c.net,0);
  const outputVat=input.vatPayer ? grossRevenue*vat/(1+vat) : 0;
  const revenueNet=grossRevenue-outputVat;
  const directCost=sum(['equipment','delivery','customs'])+importVatCost;
  const costTotal=sum(COST_KEYS)+importVatCost, grossProfit=revenueNet-directCost, preTax=revenueNet-costTotal;
  // A forecast risk reserve is not automatically a tax deduction.
  const adjustments=num(input.taxAddBack || 0,'Налоговые корректировки')+sum(['reserve']);
  const taxable=Math.max(0,preTax+adjustments), corporateTax=taxable*cit;
  const netProfit=preTax-corporateTax;
  const target=num(input.targetNetProfit || 0,'Целевая чистая прибыль');
  const minPreTax=target+adjustments>0 ? (target+cit*adjustments)/(1-cit) : target;
  const minNet=costTotal+minPreTax;
  const inputVat=costs.reduce((n,c)=>n+c.inputVat,0)+importVatCredit;
  return {currency:'KZT',importVatPaid:round(importVatPaid),importVatCredit:round(importVatCredit),cashExpenses:round(costs.reduce((n,c)=>n+c.gross,0)+importVatPaid),revenueNet:round(revenueNet),directCost:round(directCost),costTotal:round(costTotal),grossProfit:round(grossProfit),
    preTax:round(preTax),taxableProfit:round(taxable),corporateTax:round(corporateTax),netProfit:round(netProfit),
    marginPercent:revenueNet ? round(netProfit/revenueNet*100) : null,roiPercent:costTotal ? round(netProfit/costTotal*100) : null,
    minimumBidGross:Math.ceil((minNet*(input.vatPayer?1+vat:1)-1e-9)*100)/100,outputVat:round(outputVat),inputVat:round(inputVat),vatBalance:round(outputVat-inputVat),
    costs:costs.map(c=>Object.fromEntries(Object.entries(c).map(([k,v])=>[k,typeof v==='number'?round(v):v]))),
    taxPeriod:{from:tax.from,to:tax.to},
    assumptions:['Импортный НДС вводится отдельно от пошлины и сборов: не включайте его повторно в таможенные или прочие расходы. Зачёт влияет на себестоимость, но не отменяет первоначальную оплату НДС.',
      'Ставки и период введены пользователем; законодательство автоматически не проверяется.',
      'Все расходы вводятся с включённым НДС. Входной НДС вычитается из себестоимости только при выбранном праве на зачёт.',
      'Резерв на риски включён в прогноз расходов, но добавлен обратно в налоговую базу КПН.',
      'КПН рассчитан по этой сделке без учёта убытков и других операций компании. Таможенные платежи вводятся отдельной суммой.',
      'Отрицательный баланс НДС означает расчётный кредит, а не гарантированный возврат денег.'],
    completeness:input.confirmedCosts===true?'user_confirmed':'requires_review'};
}
export function validateOffers(offers=[]) {
  if(!Array.isArray(offers) || offers.length>30) fail('Не более 30 предложений');
  return offers.map(o=>{
    if(!o || !String(o.supplier || '').trim() || !String(o.model || '').trim() || !iso(o.observedAt)) fail('Для предложения нужны поставщик, модель и дата цены');
    const currency=String(o.currency || '').toUpperCase();if(!['KZT','CNY','USD','EUR'].includes(currency))fail('Неизвестная валюта');
    const price=num(o.unitPrice,'Цена поставщика'), quantity=num(o.quantity,'Количество');if(quantity<=0)fail('Количество должно быть больше нуля');
    const rate=currency==='KZT'?1:num(o.fxRate,'Курс в тенге');if(rate<=0)fail('Курс должен быть больше нуля');
    if(currency!=='KZT' && !iso(o.fxDate))fail('Нужна дата курса');
    const url=String(o.url || '');if(url){try{const u=new URL(url);if(u.protocol!=='https:' || u.username || u.password)fail('Ссылка должна начинаться с https://');}catch{fail('Некорректная ссылка поставщика');}}
    return {supplier:String(o.supplier).trim().slice(0,200),model:String(o.model).trim().slice(0,200),currency,unitPrice:price,quantity,fxRate:rate,fxDate:currency==='KZT'?o.observedAt:o.fxDate,
      observedAt:o.observedAt,url:url.slice(0,2000),totalKzt:round(price*quantity*rate),verification:'manual_unverified',
      notes:String(o.notes || '').slice(0,2000)};
  });
}
