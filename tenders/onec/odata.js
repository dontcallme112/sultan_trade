import {SaxesParser} from 'saxes';
const limit=1024*1024;
const fail=(message,status=502)=>Object.assign(new Error(message),{status});
const edmx=['http://schemas.microsoft.com/ado/2007/06/edmx','http://docs.oasis-open.org/odata/ns/edmx'];
const edm=['http://schemas.microsoft.com/ado/2006/04/edm','http://schemas.microsoft.com/ado/2007/05/edm','http://schemas.microsoft.com/ado/2008/09/edm','http://schemas.microsoft.com/ado/2009/11/edm','http://docs.oasis-open.org/odata/ns/edm'];
export function parseODataMetadata(xml){
 if(Buffer.byteLength(xml)>limit||/<!\s*(DOCTYPE|ENTITY)/i.test(xml))throw fail('Неподдерживаемый или слишком большой XML метаданных.');
 const stack=[],entities=[],seen=new Set();let root=false,schemaSeen=false;
 try{
  const p=new SaxesParser({xmlns:true});
  p.on('error',()=>{throw Error('invalid XML');});
  p.on('opentag',tag=>{
   if(stack.length>=50)throw Error('XML depth');
   if(!stack.length){if(tag.local!=='Edmx'||!edmx.includes(tag.uri))throw Error('not EDMX');root=true;}
   const parent=stack.at(-1);
   if(tag.local==='Schema'&&edm.includes(tag.uri)&&parent?.local==='DataServices'&&edmx.includes(parent.uri)&&tag.attributes.Namespace?.value)schemaSeen=true;
   if(tag.local==='EntitySet'&&edm.includes(tag.uri)&&parent?.local==='EntityContainer'&&edm.includes(parent.uri)){
    const name=tag.attributes.Name?.value,type=tag.attributes.EntityType?.value;
    if(!name||!type||name.length>300||type.length>500||seen.has(name)||entities.length>=3000)throw Error('invalid entity set');
    seen.add(name);entities.push({name,type});
   }
   stack.push({local:tag.local,uri:tag.uri});
  });p.on('closetag',()=>stack.pop());p.write(xml).close();
  if(!root||!schemaSeen)throw Error('missing EDMX schema');
 }catch{throw fail('Ответ сервера не является поддерживаемыми метаданными OData.');}
 return {entitySets:entities,entitySetCount:entities.length};
}
export function createOneCOData({env=process.env,fetchImpl=fetch,now=Date.now}={}){
 let target=null,configurationError=null,lastCheck=null,active=false;const attempts=new Map();
 const enabled=env.ONEC_READONLY_ENABLED==='true';
 if(enabled){try{
  const url=new URL(env.ONEC_ODATA_URL);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.hostname!==env.ONEC_ALLOWED_HOST||!url.pathname.endsWith('/odata/standard.odata/')||env.ONEC_ENVIRONMENT!=='test'||!env.ONEC_USERNAME||!env.ONEC_PASSWORD)throw Error('invalid config');
  target=new URL('$metadata',url);
 }catch{configurationError='Проверьте HTTPS-адрес OData, разрешённый хост, тестовый режим и серверную учётную запись.';}}
 const status=()=>({state:!enabled?'not_configured':configurationError?'invalid_configuration':lastCheck?.ok?'metadata_readable':'ready_to_check',mode:'metadata_read_only',postingEnabled:false,environment:env.ONEC_ENVIRONMENT==='test'?'test':null,lastCheck,message:!enabled?'Чтение структуры 1С не настроено. Нужны параметры тестовой базы на сервере.':configurationError||'Доступен только GET $metadata. Данные справочников и документов не запрашиваются.'});
 async function probe(user){
  if(!user)throw fail('Нужен вход сотрудника',401);
  if(!target)throw fail(configurationError||'Подключение к тестовой 1С не настроено.',409);
  const time=now();for(const [id,at] of attempts)if(time-at>=60000)attempts.delete(id);
  if(active||attempts.has(user)||attempts.size>=1000)throw fail('Проверка уже выполняется или недавно выполнена. Повторите через минуту.',429);
  attempts.set(user,time);active=true;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
   const response=await fetchImpl(target.href,{method:'GET',redirect:'error',signal:controller.signal,headers:{Authorization:'Basic '+Buffer.from(env.ONEC_USERNAME+':'+env.ONEC_PASSWORD,'utf8').toString('base64'),Accept:'application/xml','Cache-Control':'no-cache'}});
   if(!response.ok){await response.body?.cancel();throw fail([401,403].includes(response.status)?'1С отклонила учётную запись или права чтения структуры.':'Сервер 1С не предоставил метаданные.');}
   const size=Number(response.headers.get('content-length'));if(Number.isFinite(size)&&size>limit){await response.body?.cancel();throw fail('Метаданные превышают допустимый размер.');}
   if(!response.body)throw fail('Пустой ответ 1С.');
   const reader=response.body.getReader(),chunks=[];let bytes=0;
   while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>limit){await reader.cancel();throw fail('Метаданные превышают допустимый размер.');}chunks.push(Buffer.from(value));}
   const xml=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));const result=parseODataMetadata(xml);
   lastCheck={ok:true,at:new Date(now()).toISOString(),entitySetCount:result.entitySetCount};return {...result,checkedAt:lastCheck.at,mode:'metadata_read_only',postingEnabled:false};
  }catch(e){lastCheck={ok:false,at:new Date(now()).toISOString()};if(e.status)throw e;throw fail('Не удалось безопасно прочитать структуру 1С. Проверьте публикацию, сертификат и сетевой доступ.');}
  finally{clearTimeout(timer);active=false;}
 }
 return {status,probe};
}
