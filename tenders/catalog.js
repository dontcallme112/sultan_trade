// Reuses the shop's synchronized catalogue and price mapping; no external token is exposed.
export function createTenderCatalogSearch({db,normalizePrice}){
 return async q=>{
  const pattern='%'+q.replace(/[\\%_]/g,ch=>'\\'+ch)+'%';
  let query=db.from('products').select('article,name,brand,price,price1,price_usd,unit,quantity,synced_at,source').limit(20);
  query=/^\d+$/.test(q)?query.eq('article',q):query.ilike('name',pattern);
  const {data,error}=await query;if(error)throw new Error('Не удалось прочитать каталог поставщиков');
  return (data||[]).map(p=>({article:p.article,name:p.name,brand:p.brand,price:Number(p.price_usd)>0?Number(p.price_usd):normalizePrice(p).price,currency:Number(p.price_usd)>0?'USD':'KZT',unit:p.unit||null,availability:p.quantity||null,updatedAt:p.synced_at||null,source:p.source||'stockera',url:'https://sultan-trade.vercel.app/product/'+encodeURIComponent(p.article),verification:'catalog_reference'}));
 };
}
