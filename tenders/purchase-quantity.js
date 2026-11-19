// A grouped lot's aggregate quantity does not describe each product.
export function purchaseQuantityStatus(lot,offer){
 const required=lot?.quantity;
 const grouped=lot?.grouped===true||/-ОЛ-/i.test(lot?.number||'')||(lot?.extra?.enstru||[]).length>1;
 if(grouped||typeof required!=='number'||!Number.isFinite(required)||required<=0)return 'unknown';
 const supplied=offer?.quantity;
 if(typeof supplied!=='number'||!Number.isFinite(supplied)||supplied<=0)return 'unknown';
 return supplied>=required?'sufficient':'insufficient';
}
