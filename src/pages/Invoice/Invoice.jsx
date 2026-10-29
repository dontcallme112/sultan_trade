import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../api/supabaseClient';
import { BACKEND_URL } from '../../api/client';
import { formatNumber } from '../../utils/priceUtils.js';
import './Invoice.css';

const fmtDate = (iso) => new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

// Печатный счёт на оплату: открывается по адресу /invoice/<номер заказа> (только для владельца заказа), «Печать» сохраняет его в PDF
export default function Invoice() {
  const { orderId } = useParams();
  const [state, setState] = useState({ loading: true, invoice: null, error: '' });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) { if (alive) setState({ loading: false, invoice: null, error: 'Войдите в аккаунт, чтобы открыть счёт' }); return; }
        const res = await fetch(`${BACKEND_URL}/api/orders/${orderId}/invoice`, { headers: { Authorization: `Bearer ${token}` } });
        const body = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) setState({ loading: false, invoice: null, error: res.status === 404 ? 'Счёт не найден' : (body.error || 'Не удалось загрузить счёт') });
        else setState({ loading: false, invoice: body, error: '' });
      } catch { if (alive) setState({ loading: false, invoice: null, error: 'Нет связи с сервером' }); }
    })();
    return () => { alive = false; };
  }, [orderId]);

  const { loading, invoice: inv, error } = state;
  if (loading) return <div className="invoice-page"><p className="invoice-note">Загружаем счёт…</p></div>;
  if (error) return <div className="invoice-page"><p className="invoice-note" role="alert">{error}</p></div>;

  return (
    <div className="invoice-page">
      <div className="invoice-toolbar no-print">
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>Печать / сохранить в PDF</button>
      </div>
      <article className="invoice-sheet">
        <h1>Счёт на оплату № {inv.number} от {fmtDate(inv.date)}</h1>

        <table className="invoice-bank">
          <tbody>
            <tr><th>Бенефициар</th><td>{inv.seller.name}<br />БИН/ИИН: {inv.seller.bin}</td><th>КБе</th><td>{inv.seller.kbe || ''}</td></tr>
            <tr><th>ИИК (IBAN)</th><td colSpan={3}>{inv.seller.iban}</td></tr>
            <tr><th>Банк бенефициара</th><td>{inv.seller.bank}</td><th>БИК</th><td>{inv.seller.bic}</td></tr>
          </tbody>
        </table>

        <div className="invoice-parties">
          <p><b>Поставщик:</b> {inv.seller.name}, БИН/ИИН {inv.seller.bin}{inv.seller.address ? `, ${inv.seller.address}` : ''}{inv.seller.phone ? `, тел.: ${inv.seller.phone}` : ''}</p>
          <p><b>Покупатель:</b> {inv.buyer.name}{inv.buyer.phone ? `, тел.: ${inv.buyer.phone}` : ''}{inv.buyer.address ? `, адрес: ${inv.buyer.address}` : ''}</p>
        </div>

        <table className="invoice-items">
          <thead><tr><th>№</th><th>Наименование</th><th>Кол-во</th><th>Ед.</th><th>Цена, ₸</th><th>Сумма, ₸</th></tr></thead>
          <tbody>
            {inv.items.map((it) => (
              <tr key={it.n}><td>{it.n}</td><td className="left">{it.name}</td><td>{formatNumber(it.qty)}</td><td>{it.unit}</td><td>{formatNumber(it.price)}</td><td>{formatNumber(it.sum)}</td></tr>
            ))}
          </tbody>
        </table>

        <div className="invoice-total">
          <p>Итого: <b>{formatNumber(inv.total)} ₸</b></p>
          <p>{inv.vat ? `В том числе НДС ${inv.vat.rate}%: ${formatNumber(inv.vat.amount)} ₸` : 'Без НДС'}</p>
          <p>Всего к оплате: <b>{formatNumber(inv.total)} ₸</b></p>
          <p className="invoice-words">{inv.totalWords}</p>
        </div>

        <p className="invoice-foot">Оплатить до <b>{fmtDate(inv.due)}</b>. В назначении платежа укажите: <b>{inv.purpose}</b>.</p>
      </article>
    </div>
  );
}
