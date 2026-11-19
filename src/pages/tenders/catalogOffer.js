const currencies=['KZT','USD','CNY','EUR'];
export function catalogOffer(product,quantity=1){
 const price=Number(product.price),currency=product.currency;
 if(!currencies.includes(currency)||!Number.isFinite(price)||price<=1||!product.updatedAt||!Number.isFinite(Date.parse(product.updatedAt)))return null;
 return {supplier:(product.source||'Stockera')+' (справочная цена каталога)',model:product.name,currency,unitPrice:price,quantity,fxRate:currency==='KZT'?1:'',fxDate:currency==='KZT'?product.updatedAt.slice(0,10):'',observedAt:product.updatedAt.slice(0,10),url:product.url,notes:'Цена каталога, не подтверждённая закупочная стоимость. Подтвердите цену поставщика, модель и наличие.'};
}
export function offerEquipmentTotal(offer){
 const price=Number(offer.unitPrice),quantity=Number(offer.quantity),rate=offer.currency==='KZT'?1:Number(offer.fxRate);
 if(!currencies.includes(offer.currency)||offer.unitPrice===''||!Number.isFinite(price)||price<=0||!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(rate)||rate<=0)return null;
 if(offer.currency!=='KZT'&&(!offer.fxDate||!Number.isFinite(Date.parse(offer.fxDate))))return null;
 const total=price*quantity*rate;return Number.isFinite(total)?Math.round((total+Number.EPSILON)*100)/100:null;
}
