import {Worker} from 'node:worker_threads';
export async function runDocumentExtraction(input){
  const worker=new Worker(new URL('./documents-worker.js',import.meta.url),{workerData:input,resourceLimits:{maxOldGenerationSizeMb:256,stackSizeMb:4}});
  let timer;
  try{return await new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(Object.assign(new Error('Документ обрабатывается слишком долго. Разделите файл на части.'),{status:504,code:'EXTRACTION_TIMEOUT'})),30000);
    worker.once('message',m=>m.ok?resolve(m.result):reject(Object.assign(new Error(m.error),{status:m.status || 400,code:m.code})));
    worker.once('error',()=>reject(Object.assign(new Error('Не удалось обработать документ в доступных ресурсах.'),{status:422,code:'EXTRACTION_FAILED'})));
    worker.once('exit',code=>{if(code!==0)reject(Object.assign(new Error('Обработка документа прервана.'),{status:422,code:'EXTRACTION_FAILED'}));});
  });}finally{clearTimeout(timer);await worker.terminate();}
}
