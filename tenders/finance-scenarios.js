import {calculateFinance,COST_KEYS} from './finance.js';
const percent=(value,name,max)=>{
 if(value==null||value===''||typeof value==='boolean'||!Number.isFinite(Number(value))||Number(value)<0||Number(value)>max)throw Object.assign(new Error(`Укажите ${name}: 0–${max}%`),{status:400});
 return Number(value);
};
// Hypothetical changes to explicitly supplied costs; never supplier price estimates.
export function financeScenarios({finance,discountPercent,costIncreasePercent}={}){
 const base=calculateFinance(finance),discount=percent(discountPercent,'снижение цены',100),growth=percent(costIncreasePercent,'рост расходов',200);
 const make=(key,d,g)=>{
  const factor=1+g/100;
  const input={...finance,bidGross:Number(finance.bidGross)*(1-d/100),costs:Object.fromEntries(COST_KEYS.map(k=>[k,{...finance.costs[k],gross:Number(finance.costs[k].gross)*factor}])),importVat:{recoverable:false,...finance.importVat,amount:Number(finance.importVat?.amount??0)*factor}};
  const results=calculateFinance(input),breakEven=calculateFinance({...input,targetNetProfit:0}).minimumBidGross;
  return {key,discountPercent:d,costIncreasePercent:g,bidGross:Math.round(input.bidGross*100)/100,results,breakEvenBidGross:breakEven,deltaNetProfit:Math.round((results.netProfit-base.netProfit)*100)/100,belowBreakEven:input.bidGross<breakEven};
 };
 return {currency:'KZT',rows:[make('base',0,0),make('discount',discount,0),make('costs',0,growth),make('combined',discount,growth)],assumptions:[
  'Сценарии — допущения пользователя, не реальные цены и не прогноз поставщика.',
  'Рост применяется ко всем восьми статьям расходов и отдельно введённому импортному НДС. Нулевые статьи остаются нулевыми.',
  'Налоговые ставки, право на зачёт, период, налоговая корректировка сверх резерва и целевая прибыль остаются исходными. НДС и КПН пересчитываются отдельно для каждой строки.',
  'Безубыточная цена рассчитана с нулевой целевой прибылью; минимальная цена с вашей целевой прибылью показана отдельно. Сценарии не сохраняются и не изменяют отчёт.'
 ]};
}
