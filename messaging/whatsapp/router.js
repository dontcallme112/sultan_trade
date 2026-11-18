import express from 'express';
import rateLimit from 'express-rate-limit';
import {WA_PATH} from './domain.js';
export function createWhatsAppWebhookRouter(service){
 const r=express.Router();
 r.use(WA_PATH,rateLimit({windowMs:60000,max:1200,standardHeaders:true,legacyHeaders:false}));
 r.all(WA_PATH,(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
 r.get(WA_PATH,(req,res)=>{try{res.type('text/plain').send(service.verify(req.query));}catch(e){res.status(e.status||503).json({error:e.status===409?'WhatsApp пока не подключён':'Вебхук не подтверждён'});}});
 r.post(WA_PATH,express.raw({type:'application/json',limit:'256kb',inflate:false}),async(req,res)=>{try{if(!Buffer.isBuffer(req.body))return res.status(400).json({error:'Нужен JSON'});await service.receive(req.body,req.headers['x-hub-signature-256']);res.json({received:true});}catch(e){res.status(e.status||503).json({error:'Событие WhatsApp не подтверждено или не сохранено'});}});
 return r;
}
