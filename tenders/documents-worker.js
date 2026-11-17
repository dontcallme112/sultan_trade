import {parentPort,workerData} from 'node:worker_threads';
import {extractDocument} from './documents.js';
try{parentPort.postMessage({ok:true,result:await extractDocument(workerData)});}
catch(e){parentPort.postMessage({ok:false,error:e.message,status:e.status,code:e.code});}
