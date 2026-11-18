// One process/replica. No demo/file imports, notification delivery or invented sources.
export function createTenderScheduler({service,intervalMinutes=60,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}){
 const minutes=Number(intervalMinutes),enabled=Number.isFinite(minutes)&&minutes>=5&&minutes<=1440;
 let timer=null,running=false,stopped=true,lastRunAt=null,lastError=null,nextRunAt=null,eligible=[];
 const status=()=>({state:!enabled?'disabled':stopped?'stopped':running?'running':eligible.length?'scheduled':'waiting_for_source',intervalMinutes:enabled?minutes:null,nextRunAt,lastRunAt,lastError,sources:eligible,message:!enabled?'Планировщик выключен. Интервал должен быть от 5 до 1440 минут.':eligible.length?'Обновляются только подключённые API-источники.':'Нет подключённых официальных API. Ручные файлы и демо не обновляются автоматически.'});
 const plan=()=>{if(stopped||!enabled)return;nextRunAt=new Date(now()+minutes*60000).toISOString();timer=setTimer(()=>{timer=null;void run();},minutes*60000);timer?.unref?.();};
 async function run(){
  if(stopped||running||!enabled)return;
  running=true;nextRunAt=null;lastError=null;
  try{
   const sources=await service.sources();eligible=sources.filter(s=>s.kind==='api'&&s.state==='ready').map(s=>s.id);
   for(const id of eligible){if(stopped)break;try{await service.sync(id);}catch{lastError='Ошибка обновления источника. Подробности в журнале синхронизации.';}}
   lastRunAt=new Date(now()).toISOString();
  }catch{lastError='Не удалось проверить источники. Проверьте доступ к базе данных.';}
  finally{running=false;plan();}
 }
 return {status,start(){if(!stopped)return;stopped=false;if(enabled)void run();},stop(){stopped=true;if(timer!==null)clearTimer(timer);timer=null;nextRunAt=null;}};
}
