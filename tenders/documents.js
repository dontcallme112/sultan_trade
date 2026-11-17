import path from 'node:path';
import {createHash} from 'node:crypto';
import yauzl from 'yauzl';
const MAX_BYTES=5*1024*1024, MAX_TEXT=300000;
const bad=(message,code='DOCUMENT_INVALID')=>Object.assign(new Error(message),{status:400,code});
async function validateZip(buffer){
  await new Promise((resolve,reject)=>yauzl.fromBuffer(buffer,{lazyEntries:true},(error,zip)=>{
    if(error)return reject(bad('Файл Office повреждён'));
    let bytes=0,expanded=0,entries=0,done=false;
    const fail=e=>{if(done)return;done=true;zip.close();reject(e);};
    zip.on('error',()=>fail(bad('Ошибка архива Office')));
    zip.on('entry',entry=>{
      bytes+=entry.uncompressedSize;entries++;
      if(bytes>25*1024*1024 || entries>2000 || (entry.generalPurposeBitFlag & 1))return fail(bad('Архив Office слишком большой или зашифрован'));
      if(entry.fileName.endsWith('/')){zip.readEntry();return;}
      zip.openReadStream(entry,(error,stream)=>{
        if(error)return fail(bad('Ошибка чтения архива Office'));
        stream.on('data',chunk=>{expanded+=chunk.length;if(expanded>25*1024*1024){stream.destroy();fail(bad('Распакованный Office больше 25 МБ'));}});
        stream.on('error',()=>fail(bad('Размер или структура архива Office не соответствует содержимому')));
        stream.on('end',()=>{if(!done)zip.readEntry();});
      });
    });
    zip.on('end',()=>{if(!done){done=true;resolve();}});zip.readEntry();
  }));
}
export function draftRequirements(text){
  const lines=String(text).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const rules=[['quantity',/количеств|\bшт\.?\b|дана/iu],['delivery',/поставк|доставк|жеткізу/iu],['deadline',/срок|мерзім/iu],['warranty',/гаранти|кепіл/iu],['license',/лиценз|лицензи/iu],['certificate',/сертифик|стандарт|ГОСТ|СТ РК|ISO/iu],['restriction',/эквивалент.*не допуска|без эквивалент|только.*(?:бренд|модел|производител)|единственн.*(?:производител|поставщик)/iu],['kit',/комплект|жиынтық/iu],['parameter',/не менее|не более|должен|должна|требуе|кемінде|кем емес/iu]];
  const requirements=[];
  lines.forEach((line,i)=>{
    for(const [type,re] of rules)if(re.test(line)){requirements.push({type,text:line.slice(0,2000),evidence:{line:i+1,quote:line.slice(0,2000)},verified:false});break;}
  });
  return {mode:'rules_draft',requirements:requirements.slice(0,200),warnings:['Предварительный поиск фраз по правилам; это не AI-анализ и не заключение о соответствии.','Количество, параметры и ограничения необходимо проверить по оригиналу.'],lineCount:lines.length};
}
export async function extractDocument({name,base64}={}){
  if(typeof name!=='string' || typeof base64!=='string' || base64.length>Math.ceil(MAX_BYTES/3)*4+4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64))throw bad('Нужен файл до 5 МБ в корректном формате');
  const bytes=Buffer.from(base64,'base64');if(!bytes.length || bytes.length>MAX_BYTES)throw bad('Файл пустой или больше 5 МБ');
  const ext=path.extname(name).toLowerCase();let text='';
  try{
    if(ext==='.txt')text=bytes.toString('utf8');
    else if(ext==='.pdf'){
      if(!bytes.subarray(0,1024).includes(Buffer.from('%PDF-')))throw bad('Это не PDF');
      const {PDFParse}=await import('pdf-parse');const parser=new PDFParse({data:bytes,isEvalSupported:false});
      try{const info=await parser.getInfo();if(info.total>200)throw bad('Не более 200 страниц');const result=await parser.getText();text=result.text;}finally{await parser.destroy();}
    }else if(ext==='.docx'){
      await validateZip(bytes);const mammoth=await import('mammoth');text=(await mammoth.extractRawText({buffer:bytes})).value;
    }else if(ext==='.xlsx'){
      await validateZip(bytes);const {default:ExcelJS}=await import('exceljs');const book=new ExcelJS.Workbook();await book.xlsx.load(bytes);let cells=0;const chunks=[];
      book.eachSheet(sheet=>{chunks.push(`[${sheet.name}]`);sheet.eachRow(row=>{const cols=[];row.eachCell(cell=>{if(++cells>50000)throw bad('Слишком много ячеек');cols.push(cell.text);});chunks.push(cols.join(' | '));});});text=chunks.join('\n');
    }else throw bad('Поддерживаются PDF, DOCX, XLSX и TXT');
  }catch(error){if(error.status)throw error;throw bad('Не удалось прочитать документ. Проверьте формат, шифрование и целостность файла.');}
  text=String(text || '').replace(/\u0000/g,'');
  if(text.length>MAX_TEXT)throw bad('Слишком большой объём текста (максимум 300 000 символов)');
  if(text.trim().length<20)throw bad('Текст не извлечён. Для скана требуется OCR; OCR-провайдер пока не подключён.','OCR_REQUIRED');
  const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);text=lines.join('\n');
  return {sha256:createHash('sha256').update(bytes).digest('hex'),name:path.basename(name).slice(0,200),format:ext.slice(1),bytes:bytes.length,text,...draftRequirements(text),ai:{status:'not_connected',message:'AI-провайдер не настроен. Текст и предварительные требования доступны для ручной проверки.'}};
}
