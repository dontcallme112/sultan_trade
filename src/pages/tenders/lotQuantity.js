export function lotQuantity(lot){
 if(lot?.grouped===true||/-ОЛ-/i.test(lot?.number||'')||(lot?.extra?.enstru||[]).length>1)return null;
 const q=lot?.quantity;
 return typeof q==='number'&&Number.isFinite(q)&&q>0?q:null;
}
export function quantityWarning(lot,quantity){
 const required=lotQuantity(lot),given=quantity===''||quantity==null?NaN:Number(quantity);
 if(required==null)return 'Объём лота требует уточнения. Для группового лота укажите количество каждого товара отдельно.';
 if(!Number.isFinite(given)||given<=0)return 'Укажите количество товара для расчёта всего лота.';
 return given<required?'Количество кандидата меньше количества лота. Стоимость не покрывает весь объём.':'';
}
