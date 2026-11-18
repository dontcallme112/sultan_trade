import {procurementAvailability} from './scoring.js';
// Evidence checklist, not an approval, legal conclusion, AI score or bid submission.
export function tenderReadiness(report){
 const lot=report.lot,acceptance=procurementAvailability({status_raw:lot.sourceStatus,deadline_at:lot.deadline},Date.parse(report.generatedAt));
 const requirements=report.document?.requirements||[];
 const failed=requirements.some(r=>r.review?.status==='fails');
 const reviewed=requirements.length>0&&requirements.every(r=>r.review?.status==='matches');
 const candidate=(report.suppliers||[]).some(r=>r.modelMatch===true&&!r.stale&&r.currentPriceAgeDays!=null&&r.totalCashKzt!=null&&r.checks?.length>0&&r.checks.every(c=>c.status==='matches')&&r.unknown?.length===0);
 const finance=report.finance?.results,confirmed=finance?.completeness==='user_confirmed';
 const profit=finance?.netProfit;
 const checks=[
  {key:'acceptance',label:'Приём заявок',state:acceptance.state==='open'?'documented':acceptance.state==='closed'?'problem':'unknown',message:acceptance.state==='open'?'По сохранённым данным источника срок не истёк. Сверьте портал перед подачей.':acceptance.state==='closed'?'Закупка закрыта или срок подачи истёк.':'Подтвердите статус и срок подачи в первоисточнике.'},
  {key:'budget',label:'Бюджет закупки',state:typeof lot.budget==='number'&&lot.budget>0?'documented':'unknown',message:typeof lot.budget==='number'&&lot.budget>0?'Сумма указана в сохранённых данных источника.':'Нет подтверждённой суммы закупки.'},
  {key:'requirements',label:'Проверка технических требований',state:failed?'problem':reviewed?'documented':'unknown',message:failed?'В проверке ТЗ есть несоответствия.':reviewed?'Извлечённые требования отмечены пользователем как совпавшие. Проверьте полноту самого ТЗ.':'Загрузите ТЗ и проверьте каждое извлечённое требование.'},
  {key:'suppliers',label:'Предварительный поставщик',state:candidate?'documented':'unknown',message:candidate?'Есть кандидат с заполненными параметрами, стоимостью и отметками наличия. Запросите действующее КП.':'Нужны сравнение модели и параметров, актуальная цена, наличие, срок, доставка и таможенные расходы.'},
  {key:'finance',label:'Расходы и прибыль',state:confirmed&&Number.isFinite(profit)?profit>0?'documented':'problem':'unknown',message:confirmed&&Number.isFinite(profit)?profit>0?'Сохранён подтверждённый пользователем расчёт с положительной прибылью.':'По сохранённому расчёту чистая прибыль не положительная.':'Сохраните расчёт и подтвердите полноту расходов и налоговых допущений.'},
  {key:'decision',label:'Лицензии, договор и решение руководителя',state:'manual',message:'Проверьте допуск, лицензии, обеспечение, штрафы, финансирование и условия договора. Решение об участии принимает руководитель.'}
 ];
 return {evaluatedAt:report.generatedAt,checks,documented:checks.filter(c=>c.state==='documented').length,problems:checks.filter(c=>c.state==='problem').length,unknown:checks.filter(c=>c.state==='unknown').length,notice:'Проверка использует только сохранённые данные вашего аккаунта. Это список подготовки, не разрешение на участие и не подтверждение соответствия.'};
}
