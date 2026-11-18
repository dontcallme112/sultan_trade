import {procurementAvailability} from './scoring.js';
// Sum already-rounded KZT scenario profits as integer cents, without floating-point addition.
const sumProfit=rows=>{
 if(!rows.length)return null;
 const cents=rows.reduce((sum,r)=>sum+BigInt(r.netProfit.toFixed(2).replace('.','')),0n),negative=cents<0n,absolute=negative?-cents:cents;
 return (negative?'-':'')+(absolute/100n).toString()+'.'+(absolute%100n).toString().padStart(2,'0');
};
export function financialPortfolio(reports,{evaluatedAt=new Date().toISOString()}={}){
 const rows=reports.map(r=>{
  const result=r.finance?.results,confirmed=result?.completeness==='user_confirmed'&&Number.isFinite(result.netProfit);
  return {id:r.lot.id,title:r.lot.title,number:r.lot.number||null,availability:procurementAvailability({status_raw:r.lot.sourceStatus,deadline_at:r.lot.deadline},Date.parse(evaluatedAt)).state,financeState:confirmed?'confirmed':result?'unconfirmed':'missing_or_invalid',calculationDate:r.finance?.inputs.date||null,netProfit:confirmed?result.netProfit:null,marginPercent:confirmed?result.marginPercent:null,minimumBidGross:confirmed?result.minimumBidGross:null};
 });
 const confirmed=rows.filter(r=>r.financeState==='confirmed'),open=rows.filter(r=>r.availability==='open'),openConfirmed=open.filter(r=>r.financeState==='confirmed');
 return {evaluatedAt,currency:'KZT',rows,summary:{selected:rows.length,confirmed:confirmed.length,unconfirmed:rows.filter(r=>r.financeState==='unconfirmed').length,missingOrInvalid:rows.filter(r=>r.financeState==='missing_or_invalid').length,open:open.length,openConfirmed:openConfirmed.length,openWithoutConfirmedFinance:open.length-openConfirmed.length,openProfitable:openConfirmed.filter(r=>r.netProfit>0).length,openNonPositive:openConfirmed.filter(r=>r.netProfit<=0).length,openKnownProfit:sumProfit(openConfirmed)},notice:'Сумма только по открытым закупкам с подтверждёнными пользователем расходами. Это независимые сохранённые сценарии, не гарантированный доход. Закрытые и неподтверждённые закупки в сумму не входят.'};
}
