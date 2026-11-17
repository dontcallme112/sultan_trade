const fail=message=>{throw Object.assign(new Error(message),{status:400});};
const numeric=(v,name,max=1e12)=>{if(!['number','string'].includes(typeof v)||(typeof v==='string'&&!v.trim())||!Number.isFinite(Number(v))||Number(v)<0||Number(v)>max)fail('Проверьте поле: '+name);return Number(v);};
const date=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const round=v=>Math.round((v+Number.EPSILON)*100)/100;
const canon=v=>String(v||'').normalize('NFKC').toLocaleLowerCase().replace(/[\s_-]/gu,'');
export const RATING_WEIGHTS={activity:15,profit:15,margin:10,availability:15,complexity:10,delivery:10,licenses:5,risk:10,reliability:10};
export function calculateExtendedRating(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input))fail('Проверьте данные рейтинга');
 const {weights=RATING_WEIGHTS,criteria={}}=input;
 if(!criteria||typeof criteria!=='object'||Array.isArray(criteria))fail('Проверьте критерии');
 if(!weights||typeof weights!=='object'||Object.keys(weights).some(k=>!(k in RATING_WEIGHTS)))fail('Неизвестный критерий рейтинга');
 const factors=Object.keys(RATING_WEIGHTS).map(key=>{
  const weight=numeric(weights[key]??RATING_WEIGHTS[key],key,100),c=criteria[key];
  if(!c||c.score===''||c.score==null)return {key,weight,score:null,reason:'Нет подтверждённой оценки'};
  if(typeof c.evidence!=='string'||!c.evidence.trim()||c.evidence.length>2000)fail('Для оценки критерия нужны основание и источник');
  return {key,weight,score:numeric(c.score,key,100),evidence:c.evidence};
 });
 const total=factors.reduce((s,f)=>s+f.weight,0);if(!total)fail('Сумма весов должна быть больше нуля');
 const known=factors.filter(f=>f.score!=null).reduce((s,f)=>s+f.weight,0);
 return {mode:'evidence_assisted_manual',score:known?round(factors.reduce((s,f)=>s+f.weight*(f.score??0),0)/known):null,coverage:round(known/total),preliminary:known<total,factors,unknown:factors.filter(f=>f.score==null&&f.weight>0).map(f=>f.key),formula:'Σ(вес × оценка известных критериев) / Σ(веса известных критериев). Полнота = известный вес / общий вес.',notice:'Прозрачная оценка по введённым данным, не автоматическое заключение AI. Высокий балл при низкой полноте не подтверждает привлекательность тендера.'};
}
export function compareSuppliers(input,{now=Date.now()}={}){
 if(!input||!Array.isArray(input.offers)||input.offers.length>30)fail('Нужно не более 30 предложений');
 if(input.requirements!=null&&!Array.isArray(input.requirements))fail('Требования должны быть массивом');
 const requirements=Array.isArray(input.requirements)?input.requirements:[];if(requirements.length>30)fail('Не более 30 параметров');
 for(const r of requirements){if(!r||typeof r.key!=='string'||!r.key.trim()||r.key.length>100||!['eq','min','max'].includes(r.op)||typeof r.value!=='string'||!r.value.trim()||r.value.length>200||typeof r.unit!=='string'||r.unit.length>30)fail('Проверьте требования');if(r.op!=='eq')numeric(r.value,r.key);}
 if(typeof input.model!=='string'||input.model.length>200)fail('Проверьте точную модель');
 const rows=input.offers.map((o,index)=>{
  if(!o||typeof o.supplier!=='string'||!o.supplier.trim()||o.supplier.length>200||typeof o.model!=='string'||!o.model.trim()||o.model.length>200||!date(o.observedAt))fail('Нужны поставщик, модель и дата цены');
  if(Date.parse(o.observedAt)>now)fail('Дата цены не может быть в будущем');
  if(!['KZT','CNY','USD','EUR'].includes(o.currency))fail('Неизвестная валюта');
  if(typeof o.url!=='string'||o.url.length>2000)fail('Нужна ссылка на источник');
  try{const u=new URL(o.url);if(u.protocol!=='https:'||u.username||u.password)fail('Нужен публичный источник https://');}catch{fail('Нужен публичный источник https://');}
  const quantity=numeric(o.quantity,'Количество');if(!quantity)fail('Количество должно быть больше нуля');
  const unitPrice=numeric(o.unitPrice,'Цена');if(unitPrice<=1)fail('Цена по запросу или нулевая цена не подходит для расчёта');
  const fx=o.currency==='KZT'?1:numeric(o.fxRate,'Курс');if(!fx)fail('Курс должен быть больше нуля');
  if(o.currency!=='KZT'&&(!date(o.fxDate)||Date.parse(o.fxDate)>now))fail('Нужна дата курса');
  const pack=numeric(o.packSize??1,'Кратность упаковки');if(!pack)fail('Кратность должна быть больше нуля');
  const purchaseQuantity=Math.ceil(quantity/pack)*pack,goodsKzt=unitPrice*purchaseQuantity*fx;
  const unknown=[],warnings=[];
  let shipping=null;
  if(o.shipping?.mode==='fixed')shipping=numeric(o.shipping.amount,'Доставка');
  else if(o.shipping?.mode==='weight')shipping=numeric(o.shipping.weightKg,'Вес')*numeric(o.shipping.rateKztKg,'Тариф')+numeric(o.shipping.fixedKzt??0,'Фиксированный сбор');
  else unknown.push('delivery');
  let customs=null;
  if(o.customs?.mode==='none'){
   if(typeof o.customs.reason!=='string'||!o.customs.reason.trim())fail('Укажите основание отсутствия таможенных платежей');customs={duty:0,fees:0,importVat:0,total:0};
  }else if(o.customs?.mode==='import'){
   const c=o.customs;if(typeof c.basis!=='string'||!c.basis.trim()||c.basis.length>2000||!date(c.from)||!date(c.to)||c.from>c.to||now<Date.parse(c.from)||now>Date.parse(c.to)+86400000-1)fail('Нужны основание и действующий период ставок импорта');
   if(shipping==null)unknown.push('customs_value');
   else {const value=goodsKzt+numeric(c.freightToBorder,'Доставка до границы')+numeric(c.valueAdjustment??0,'Корректировка таможенной стоимости');
    const duty=value*numeric(c.dutyPercent,'Пошлина',100)/100,fees=numeric(c.feesKzt,'Таможенные сборы'),vatBase=value+duty+numeric(c.vatBaseAdditions??0,'Дополнения базы импортного НДС');
    const importVat=vatBase*numeric(c.vatPercent,'Импортный НДС',100)/100;customs={value:round(value),duty:round(duty),fees:round(fees),importVat:round(importVat),total:round(duty+fees+importVat)};}
   warnings.push('Упрощённый прогноз ad valorem: основание, код ТН ВЭД, сборы и базу НДС подтвердите у брокера. Доставка до границы должна входить в общую доставку, повторно к расходам не прибавляется.');
   if(shipping!=null&&Number(c.freightToBorder)>shipping)fail('Доставка до границы не может превышать всю доставку');
  }else unknown.push('customs');
  const params=o.parameters&&typeof o.parameters==='object'&&!Array.isArray(o.parameters)?o.parameters:{};
  const checks=requirements.map(r=>{
   const actual=params[r.key];let status='unknown';
   if(actual&&typeof actual.value==='string'&&typeof actual.source==='string'&&actual.source.trim()&&actual.unit===r.unit){
    if(r.op==='eq')status=actual.value.normalize('NFKC').trim().toLowerCase()===r.value.normalize('NFKC').trim().toLowerCase()?'matches':'fails';
    else if(actual.value.trim()&&Number.isFinite(Number(actual.value)))status=(r.op==='min'?Number(actual.value)>=Number(r.value):Number(actual.value)<=Number(r.value))?'matches':'fails';
   }
   return {...r,actual:actual?.value??null,source:typeof actual?.source==='string'?actual.source.slice(0,2000):null,status};
  });
  const modelMatch=input.model.trim()?canon(input.model)===canon(o.model):null;
  if(modelMatch===false)warnings.push('Точная модель не совпадает; допустимость эквивалента не подтверждена.');
  if(!requirements.length)unknown.push('requirements');
  const ageDays=Math.floor((now-Date.parse(o.observedAt))/86400000);if(ageDays>7)warnings.push('Цена старше 7 дней. Обновите предложение.');
  if(!o.availabilityConfirmed)unknown.push('availability');
  if(!o.deliveryConfirmed)unknown.push('delivery_date');
  const complete=shipping!=null&&customs!=null;
  return {index,supplier:o.supplier,model:o.model,url:o.url,currency:o.currency,unitPrice,observedAt:o.observedAt,fxDate:o.currency==='KZT'?o.observedAt:o.fxDate,ageDays,stale:ageDays>7,priceKind:o.priceKind==='catalog_reference'?'catalog_reference':'manual_unverified',quantity,purchaseQuantity,goodsKzt:round(goodsKzt),shippingKzt:shipping==null?null:round(shipping),customs,totalCashKzt:complete?round(goodsKzt+shipping+customs.total):null,costWithoutRecoverableImportVat:complete&&o.importVatRecoverable===true?round(goodsKzt+shipping+customs.total-customs.importVat):null,modelMatch,checks,unknown,warnings,fullCompliance:false,completeness:complete?'estimated':'incomplete'};
 });
 return {rows,notice:'Все предложения требуют проверки. Расчёт не подтверждает цену, наличие, подлинность документа или соответствие. Импортный НДС показан отдельно от прибыли; право на зачёт указывает пользователь.'};
}
export function supplierSources(catalogConnected=false){return [
 {id:'stockera',state:catalogConnected?'ready':'not_connected',message:'Каталог существующей интеграции Al-Style/Stockera. Даты обновления сохраняются; публичная цена магазина не является подтверждённой закупочной ценой.'},
 {id:'kazakhstan-manual',state:'manual',message:'Подтверждённые источники Казахстана: добавление предложений со ссылками, датой цены и характеристиками.'},
 {id:'1688',state:'manual_only',message:'Прямой API не подключён. Разрешён ручной ввод предложения 1688 в CNY с датой курса; автоматический сбор не выполняется.'},
 {id:'pinduoduo',state:'not_connected',message:'Не подключено: разрешённый и технически доступный способ интеграции не подтверждён.'}
 ];}
