import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity, AlertCircle, BadgeDollarSign, Boxes, ChevronDown, ChevronLeft, ChevronRight,
  CircleDollarSign, ClipboardList, Code2, Database, ExternalLink, Eye, FileJson, Gauge, Globe2,
  Layers3, LockKeyhole, MapPin, Megaphone, Menu, MousePointerClick, PackageSearch, RefreshCw,
  Search, ServerCog, ShoppingBag, ShoppingCart, Smartphone, Tag, TrendingDown, TrendingUp,
  Truck, UserRound, UsersRound, WalletCards, Workflow, Mail, Clock, ShieldCheck, CheckCircle2, X, Moon, Sun,
} from 'lucide-react';
import { api, money, shortDate } from './api';
import type { Aggregate, AutomationJob, AutomationJobsResponse, AutomationStatus, AutomationType, CapabilityResponse, Dashboard, EmailMarketingReport, Health, MarketingMonth, Meta, Order } from './types';

type View = 'dashboard' | 'orders' | 'automations' | 'email' | 'attribution' | 'capabilities' | 'explorer';
const today = new Date();
const initialFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
const initialTo = today.toISOString().slice(0, 10);
const statusNames: Record<string, string> = { pending: 'Pendiente', processing: 'Procesando', 'on-hold': 'En espera', completed: 'Completado', cancelled: 'Cancelado', refunded: 'Reembolsado', failed: 'Fallido', trash: 'Papelera' };
const defaultStatuses = ['processing', 'completed', 'refunded'];
const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function App() {
  const [view, setView] = useState<View>('dashboard');
  const [health, setHealth] = useState<Health | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('zafran-theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => { api<Health>('/health').then(setHealth).catch(() => setHealth(null)); }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('zafran-theme', theme); }, [theme]);
  const navigate = (next: View) => { setView(next); setSelectedOrder(null); setMobileOpen(false); };
  const openOrder = (id: number) => { setSelectedOrder(id); setView('orders'); setMobileOpen(false); };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="brand"><div className="brand-mark">Z</div><div><strong>Zafrán</strong><span>Commerce intelligence</span></div></div>
        <nav>
          <Nav active={view === 'dashboard'} icon={<Gauge />} onClick={() => navigate('dashboard')}>Resumen</Nav>
          <Nav active={view === 'orders'} icon={<ShoppingCart />} onClick={() => navigate('orders')}>Pedidos</Nav>
          <Nav active={view === 'automations'} icon={<Workflow />} onClick={() => navigate('automations')}>Automatizaciones</Nav>
          <Nav active={view === 'email'} icon={<Mail />} onClick={() => navigate('email')}>Email marketing</Nav>
          <Nav active={view === 'attribution'} icon={<Megaphone />} onClick={() => navigate('attribution')}>Origen y zonas</Nav>
          <Nav active={view === 'capabilities'} icon={<Layers3 />} onClick={() => navigate('capabilities')}>Todo lo disponible</Nav>
          <Nav active={view === 'explorer'} icon={<Code2 />} onClick={() => navigate('explorer')}>Explorador API</Nav>
        </nav>
        <div className="sidebar-foot">
          <div className={`connection-dot ${health?.configured ? 'online' : ''}`} />
          <div><strong>{health?.configured ? 'API conectada' : 'Configuración pendiente'}</strong><span>Solo lectura</span></div>
          <LockKeyhole size={15} />
        </div>
      </aside>
      {mobileOpen && <button className="overlay" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú" />}
      <main>
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen(true)}><Menu /></button>
          <div className="store-pill"><span className="pulse" /> zafran.com.ar <ExternalLink size={13} /></div>
          <button className="theme-toggle" onClick={() => setTheme((value) => value === 'light' ? 'dark' : 'light')} aria-label={theme === 'light' ? 'Activar modo oscuro' : 'Activar modo claro'} title={theme === 'light' ? 'Activar modo oscuro' : 'Activar modo claro'}>{theme === 'light' ? <Moon /> : <Sun />}<span>{theme === 'light' ? 'Oscuro' : 'Claro'}</span></button>
          <div className="readonly"><Eye size={15} /> Modo lectura</div>
        </header>
        <GlobalLoading />
        {!health?.configured && health && <SetupBanner />}
        {view === 'dashboard' && <DashboardView configured={!!health?.configured} />}
        {view === 'orders' && (selectedOrder ? <OrderDetail id={selectedOrder} onBack={() => setSelectedOrder(null)} /> : <OrdersView configured={!!health?.configured} onSelect={openOrder} />)}
        {view === 'automations' && <AutomationsView configured={!!health?.databaseConfigured} onSelectOrder={openOrder} />}
        {view === 'email' && <EmailMarketingView configured={!!health?.configured} />}
        {view === 'attribution' && <AttributionView configured={!!health?.configured} onSelectOrder={openOrder} />}
        {view === 'capabilities' && <CapabilitiesView />}
        {view === 'explorer' && <ExplorerView configured={!!health?.configured} />}
      </main>
    </div>
  );
}

function Nav({ active, icon, onClick, children }: { active: boolean; icon: ReactNode; onClick: () => void; children: ReactNode }) {
  return <button className={active ? 'active' : ''} onClick={onClick}>{icon}<span>{children}</span></button>;
}

function GlobalLoading() {
  const [pending, setPending] = useState(0);
  useEffect(() => {
    const onLoading = (event: Event) => setPending((value) => Math.max(0, value + Number((event as CustomEvent).detail || 0)));
    window.addEventListener('api-loading', onLoading);
    return () => window.removeEventListener('api-loading', onLoading);
  }, []);
  return pending > 0 ? <div className="global-loading" role="status" aria-live="polite"><div className="global-progress"><i /></div><span><RefreshCw className="spin" /> Consultando datos de WooCommerce…</span></div> : null;
}

function SetupBanner() {
  return <div className="setup-banner"><div className="setup-icon"><LockKeyhole /></div><div><strong>Agregá tus claves para ver los datos reales</strong><p>Copiá <code>.env.example</code> como <code>server/.env</code>, pegá allí la Consumer Key y el Consumer Secret, y reiniciá el servidor.</p></div></div>;
}

function StatusFilter({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const options = ['processing', 'completed', 'refunded', 'pending', 'on-hold', 'cancelled', 'failed'];
  const toggle = (status: string) => {
    const next = value.includes(status) ? value.filter((item) => item !== status) : [...value, status];
    if (next.length) onChange(next);
  };
  const isWooPreset = defaultStatuses.every((status) => value.includes(status)) && value.length === defaultStatuses.length;
  return <div className="status-filter"><div className="status-filter-title"><div><strong>Estados contabilizados</strong><span>El informe nativo incluye Procesando, Completado y Reembolsado.</span></div><button className={isWooPreset ? 'active' : ''} onClick={() => onChange(defaultStatuses)}>Criterio WooCommerce</button></div><div className="status-options">{options.map((status) => <label key={status} className={value.includes(status) ? 'selected' : ''}><input type="checkbox" checked={value.includes(status)} onChange={() => toggle(status)} /><span>{statusNames[status]}</span></label>)}</div><small>Después de cambiar estados, presioná “Actualizar” o “Analizar”. Los reembolsados suman como pedido, pero su venta queda en cero y el reembolso se informa por separado.</small></div>;
}

function DashboardView({ configured }: { configured: boolean }) {
  const [from, setFrom] = useState(initialFrom); const [to, setTo] = useState(initialTo);
  const [data, setData] = useState<Dashboard | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const [statuses, setStatuses] = useState(defaultStatuses);
  const [comparison, setComparison] = useState<'none' | 'previous' | 'previousYear' | 'custom'>('none');
  const [customFrom, setCustomFrom] = useState(shiftDate(initialFrom, -1, 'year')); const [customTo, setCustomTo] = useState(shiftDate(initialTo, -1, 'year'));
  const load = () => {
    if (!configured) return;
    setLoading(true); setError('');
    const customQuery = comparison === 'custom' ? `&compare_from=${customFrom}&compare_to=${customTo}` : '';
    api<Dashboard>(`/dashboard?from=${from}&to=${to}&statuses=${statuses.join(',')}${customQuery}`).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, [configured]);
  const compared = comparison === 'none' ? undefined : data?.comparisons[comparison];
  const comparedPeriod = comparison === 'none' ? undefined : data?.periods[comparison];
  return <section className="page">
    <PageTitle eyebrow="PANORAMA COMERCIAL" title="Resumen de la tienda" subtitle="Una lectura clara de ventas, pedidos y clientes." />
    <div className="date-controls"><label>Desde<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><span>—</span><label>Hasta<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label><button className="primary" onClick={load} disabled={!configured || loading}>{loading ? <RefreshCw className="spin" /> : <RefreshCw />} Actualizar</button></div>
    <StatusFilter value={statuses} onChange={setStatuses} />
    {error && <ErrorBox message={error} />}
    <div className="metrics-grid">
      <Metric label="Ventas netas · WooCommerce" value={data ? money(data.financials.wooNetSales) : '—'} note="Sin IVA, impuestos ni envío" delta={compared?.delta.revenue} icon={<CircleDollarSign />} accent="forest" />
      <Metric label="Ventas brutas · WooCommerce" value={data ? money(data.financials.wooGrossSales) : '—'} note="Total con IVA y envío, menos reembolsos" icon={<BadgeDollarSign />} accent="amber" />
      <Metric label="Pedidos contabilizados" value={data?.orders ?? '—'} note={data ? data.selectedStatuses.map((s) => statusNames[s]).join(' + ') : 'Según estados elegidos'} delta={compared?.delta.orders} icon={<ShoppingBag />} accent="blue" />
      <Metric label="Ticket neto promedio" value={data ? money(data.averageTicket) : '—'} note="Ventas netas ÷ pedidos contabilizados" delta={compared?.delta.averageTicket} icon={<UsersRound />} accent="plum" />
    </div>
    <div className="dashboard-grid">
      <article className="panel sales-panel wide comparison-panel"><div className="comparison-head"><PanelHead title="Evolución de ventas netas" subtitle="Mismo criterio que el informe de WooCommerce: sin impuestos ni envío" /><div className="segment-control"><button className={comparison === 'none' ? 'active' : ''} onClick={() => setComparison('none')}>Sin comparar</button><button className={comparison === 'previous' ? 'active' : ''} onClick={() => setComparison('previous')}>Mes anterior</button><button className={comparison === 'previousYear' ? 'active' : ''} onClick={() => setComparison('previousYear')}>Mismo período año anterior</button><button className={comparison === 'custom' ? 'active' : ''} onClick={() => setComparison('custom')}>Personalizado</button></div></div>{comparison === 'custom' && <div className="custom-comparison"><label>Comparar desde<input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></label><label>Hasta<input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></label><button className="primary" onClick={load}>Aplicar comparación</button></div>}{data ? <><ComparisonChart current={data.byDay} baseline={compared?.byDay || []} currentLabel={`${data.periods.current.from} — ${data.periods.current.to}`} baselineLabel={comparedPeriod ? `${comparedPeriod.from} — ${comparedPeriod.to}` : ''} />{compared && <div className="comparison-summary"><Delta label="Venta neta" value={data.revenue} baseline={compared.revenue} delta={compared.delta.revenue} moneyValue /><Delta label="Pedidos" value={data.orders} baseline={compared.orders} delta={compared.delta.orders} /><Delta label="Ticket promedio" value={data.averageTicket} baseline={compared.averageTicket} delta={compared.delta.averageTicket} moneyValue /><Delta label="Clientes" value={data.uniqueCustomers} baseline={compared.uniqueCustomers} delta={compared.delta.uniqueCustomers} /></div>}</> : <Empty icon={<Activity />} text="Todavía no hay datos para graficar" />}</article>
      <article className="panel financial-panel"><PanelHead title="Cómo se compone la venta" subtitle="Importes del período seleccionado" />{data ? <FinancialBreakdown data={data} /> : <Empty icon={<CircleDollarSign />} text="Sin datos financieros" />}</article>
      <article className="panel"><PanelHead title="Estado de pedidos" subtitle="Distribución del período" /><div className="status-list">{data && Object.entries(data.byStatus).map(([name, count]) => <div className="status-row" key={name}><Status value={name} /><strong>{count}</strong><div className="track"><i style={{ width: `${Math.max(4, count / data.orders * 100)}%` }} /></div></div>)}</div></article>
      <article className="panel wide"><PanelHead title="Productos destacados" subtitle="Ordenados por unidades vendidas" /><div className="product-table"><div className="table-head"><span>Producto</span><span>Unidades</span><span>Ingreso neto</span></div>{data?.topProducts.map((p, i) => <div className="product-row" key={p.id}><span><b>{String(i + 1).padStart(2, '0')}</b>{p.name}</span><strong>{p.quantity}</strong><strong>{money(p.revenue)}</strong></div>)}</div></article>
      <article className="panel"><PanelHead title="Canales de adquisición" subtitle={`${data?.attribution.attributionRate || 0}% de pedidos con atribución`} />{data && <RankingBars items={data.attribution.channels.slice(0, 6)} />}</article>
      <article className="panel"><PanelHead title="Zonas con más pedidos" subtitle="Según dirección de envío" />{data && <RankingBars items={data.geography.provinces.slice(0, 6)} />}</article>
      <article className="panel"><PanelHead title="Medios de pago" subtitle="Cantidad de pedidos con ingreso" /><div className="payment-list">{data?.payments.map((p) => <div key={p.name}><WalletCards /><span>{p.name}</span><strong>{p.count}</strong></div>)}</div></article>
    </div>
  </section>;
}

function OrdersView({ configured, onSelect }: { configured: boolean; onSelect: (id: number) => void }) {
  const [orders, setOrders] = useState<Order[]>([]); const [total, setTotal] = useState(0); const [page, setPage] = useState(1);
  const [search, setSearch] = useState(''); const [status, setStatus] = useState(''); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const load = () => {
    if (!configured) return;
    setLoading(true); setError('');
    api<{ data: Order[]; total: number }>(`/orders?page=${page}&per_page=20&status=${status}&search=${encodeURIComponent(search)}`).then((r) => { setOrders(r.data); setTotal(r.total || 0); }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, [configured, page, status]);
  return <section className="page">
    <PageTitle eyebrow="OPERACIÓN" title="Pedidos" subtitle="Buscá, filtrá y abrí cada venta hasta el último metadato." />
    <div className="order-toolbar"><div className="search-box"><Search /><input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} placeholder="Número, nombre o correo…" /></div><div className="select-wrap"><select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">Todos los estados</option>{Object.entries(statusNames).map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select><ChevronDown /></div><button className="primary" onClick={load}><Search /> Buscar</button></div>
    {error && <ErrorBox message={error} />}
    <div className="table-panel"><div className="orders-table table-head"><span>Pedido</span><span>Cliente</span><span>Fecha</span><span>Estado</span><span>Origen</span><span>Pago</span><span>Total</span><span /></div>{loading ? <Loader /> : orders.length ? orders.map((order) => <button className="orders-table order-row" key={order.id} onClick={() => onSelect(order.id)}><span className="order-number">#{order.number || order.id}</span><span><strong>{order.billing?.first_name} {order.billing?.last_name}</strong><small>{order.billing?.email || 'Invitado'}</small></span><span>{shortDate(order.date_created)}</span><span><Status value={order.status} /></span><span className="origin-cell"><strong>{order._attribution?.source || 'Sin identificar'}</strong><small>{order._attribution?.channel || 'Sin atribución'}</small></span><span>{order.payment_method_title || '—'}</span><span className="total">{money(order.total)}</span><span><ChevronRight /></span></button>) : <Empty icon={<ClipboardList />} text="No se encontraron pedidos" />}</div>
    <div className="pagination"><span>{total} pedidos encontrados</span><div><button disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft /></button><b>Página {page}</b><button disabled={page * 20 >= total} onClick={() => setPage(page + 1)}><ChevronRight /></button></div></div>
  </section>;
}

function OrderDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const [order, setOrder] = useState<Order | null>(null); const [error, setError] = useState(''); const [rawOpen, setRawOpen] = useState(false);
  useEffect(() => { api<Order>(`/orders/${id}`).then(setOrder).catch((e) => setError(e.message)); }, [id]);
  if (error) return <section className="page"><button className="back" onClick={onBack}><ChevronLeft /> Volver</button><ErrorBox message={error} /></section>;
  if (!order) return <section className="page"><Loader /></section>;
  const fullName = `${order.billing?.first_name || ''} ${order.billing?.last_name || ''}`.trim() || 'Cliente invitado';
  return <section className="page">
    <button className="back" onClick={onBack}><ChevronLeft /> Todos los pedidos</button>
    <div className="detail-title"><div><span className="eyebrow">PEDIDO</span><h1>#{order.number || order.id}</h1><p>Creado {shortDate(order.date_created)} · ID interno {order.id}</p></div><Status value={order.status} /></div>
    <div className="detail-grid">
      <article className="panel detail-main"><PanelHead title="Artículos" subtitle={`${order.line_items?.length || 0} líneas en el pedido`} /><div className="line-items">{order.line_items?.map((item) => <div className="line-item" key={item.id}><div className="product-thumb">{item.image?.src ? <img src={item.image.src} alt="" /> : <PackageSearch />}</div><div><strong>{item.name}</strong><span>SKU {item.sku || '—'} · Producto #{item.product_id}{item.variation_id ? ` · Variación #${item.variation_id}` : ''}</span></div><span>{item.quantity} × {money(Number(item.subtotal) / item.quantity)}</span><strong>{money(item.total)}</strong></div>)}</div><div className="totals"><div><span>Descuento</span><b>− {money(order.discount_total)}</b></div><div><span>Envío</span><b>{money(order.shipping_total)}</b></div><div><span>Impuestos</span><b>{money(order.total_tax)}</b></div><div className="grand-total"><span>Total</span><b>{money(order.total)} <small>{order.currency}</small></b></div></div></article>
      <aside className="detail-side">
        <article className="panel"><PanelHead title="Cliente" subtitle={order.customer_id ? `Cuenta #${order.customer_id}` : 'Compra como invitado'} /><div className="customer-name"><UserRound /> <strong>{fullName}</strong></div><Info label="Correo" value={order.billing?.email} sensitive /><Info label="Teléfono" value={order.billing?.phone} sensitive /><Info label="Facturación" value={addressText(order.billing)} sensitive /><Info label="Envío" value={addressText(order.shipping)} sensitive /></article>
        <article className="panel"><PanelHead title="Pago y envío" /><Info label="Método de pago" value={order.payment_method_title} /><Info label="Transacción" value={order.transaction_id || 'Sin ID registrado'} /><Info label="Fecha de pago" value={order.date_paid ? shortDate(order.date_paid) : 'Sin fecha'} /><Info label="Cupones" value={order.coupon_lines?.map((c) => c.code).join(', ') || 'Ninguno'} /></article>
        <article className="panel"><PanelHead title="Origen del pedido" subtitle="Atribución registrada por WooCommerce" /><Info label="Fuente" value={order._attribution?.source} /><Info label="Canal" value={order._attribution?.channel} /><Info label="Medio UTM" value={order._attribution?.medium} /><Info label="Campaña" value={order._attribution?.campaign} /><Info label="Dispositivo" value={order._attribution?.device} /><Info label="Página de entrada" value={order._attribution?.landing} /></article>
      </aside>
      <article className="panel metadata-panel"><PanelHead title="Metadatos del pedido" subtitle="Campos extra de Mercado Pago, atribución, campañas y otros plugins" /><MetaTable items={order.meta_data || []} /></article>
      <article className="panel notes-panel"><PanelHead title="Actividad relacionada" subtitle={`${order._related?.notes?.length || 0} notas · ${order._related?.refunds?.length || 0} reembolsos`} /><JsonPreview data={order._related || {}} /></article>
    </div>
    <button className="raw-toggle" onClick={() => setRawOpen(true)}><FileJson /> Ver respuesta JSON completa</button>
    {rawOpen && <Modal title={`JSON completo · Pedido #${order.number}`} onClose={() => setRawOpen(false)}><pre className="json">{JSON.stringify(order, null, 2)}</pre></Modal>}
  </section>;
}

type Drilldown = { dimension: 'channel' | 'source' | 'campaign' | 'device' | 'landing' | 'province' | 'city'; value: string; title: string };
type AttributionOrder = { id: number; number: string; date_created: string; status: string; total: number; customer: string; source: string; channel: string; campaign: string; city: string; province: string };

function AttributionView({ configured, onSelectOrder }: { configured: boolean; onSelectOrder: (id: number) => void }) {
  const [from, setFrom] = useState(initialFrom); const [to, setTo] = useState(initialTo);
  const [statuses, setStatuses] = useState(defaultStatuses);
  const [data, setData] = useState<Dashboard | null>(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const [drilldown, setDrilldown] = useState<Drilldown | null>(null); const [orders, setOrders] = useState<AttributionOrder[]>([]); const [ordersLoading, setOrdersLoading] = useState(false);
  const load = () => { if (!configured) return; setLoading(true); setError(''); api<Dashboard>(`/dashboard?from=${from}&to=${to}&statuses=${statuses.join(',')}`).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false)); };
  useEffect(load, [configured]);
  const openDrilldown = (selection: Drilldown) => {
    setDrilldown(selection); setOrders([]); setOrdersLoading(true);
    api<{ data: AttributionOrder[] }>(`/attribution/orders?from=${from}&to=${to}&statuses=${statuses.join(',')}&dimension=${selection.dimension}&value=${encodeURIComponent(selection.value)}`)
      .then((result) => setOrders(result.data)).catch((e) => setError(e.message)).finally(() => setOrdersLoading(false));
  };
  const email = data?.attribution.channels.find((item) => item.name === 'Email');
  const direct = data?.attribution.channels.find((item) => item.name === 'Directo / sin identificar');
  return <section className="page">
    <PageTitle eyebrow="ATRIBUCIÓN Y TERRITORIO" title="De dónde vienen las ventas" subtitle="Fuentes, campañas, dispositivos, páginas de entrada y zonas de entrega." />
    <div className="date-controls"><label>Desde<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><span>—</span><label>Hasta<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label><button className="primary" onClick={load} disabled={!configured || loading}>{loading ? <RefreshCw className="spin" /> : <RefreshCw />} Analizar</button></div>
    <StatusFilter value={statuses} onChange={setStatuses} />
    {error && <ErrorBox message={error} />}
    <div className="metrics-grid attribution-metrics">
      <Metric label="Pedidos identificados" value={data ? `${data.attribution.attributionRate}%` : '—'} note={`${data?.attribution.attributedOrders || 0} pedidos con información de origen`} icon={<MousePointerClick />} accent="forest" />
      <Metric label="Email" value={email?.orders ?? '—'} note={email ? `${money(email.revenue)} de venta neta` : 'Sin pedidos identificados'} icon={<Megaphone />} accent="amber" />
      <Metric label="Directo / sin identificar" value={direct?.orders ?? '—'} note={direct ? `${money(direct.revenue)} de venta neta` : 'Sin pedidos directos'} icon={<Globe2 />} accent="blue" />
      <Metric label="Zona principal" value={data?.geography.provinces[0]?.orders ?? '—'} note={data?.geography.provinces[0]?.name || 'Sin datos de envío'} icon={<MapPin />} accent="plum" />
    </div>
    <div className="insights-grid">
      <article className="panel"><PanelHead title="Canales" subtitle="Seleccioná una fila para ver sus pedidos" />{data && <RankingBars items={data.attribution.channels} onSelect={(item) => openDrilldown({ dimension: 'channel', value: item.name, title: `Canal: ${item.name}` })} />}</article>
      <article className="panel"><PanelHead title="Fuentes UTM" subtitle="emBlue, Google, directo y otras fuentes" />{data && <RankingBars items={data.attribution.sources} onSelect={(item) => openDrilldown({ dimension: 'source', value: item.name, title: `Fuente: ${item.name}` })} />}</article>
      <article className="panel"><PanelHead title="Campañas UTM" subtitle="utm_campaign registrado en el pedido" />{data && <RankingTable items={data.attribution.campaigns} onSelect={(item) => openDrilldown({ dimension: 'campaign', value: item.name, title: `Campaña: ${item.name}` })} />}</article>
      <article className="panel"><PanelHead title="Dispositivos" subtitle="Dispositivo usado durante la sesión" />{data && <RankingBars items={data.attribution.devices} onSelect={(item) => openDrilldown({ dimension: 'device', value: item.name, title: `Dispositivo: ${item.name}` })} icon={<Smartphone />} />}</article>
      <article className="panel"><PanelHead title="Páginas de entrada" subtitle="Landing page de la primera visita atribuida" />{data && <RankingTable items={data.attribution.landingPages} onSelect={(item) => openDrilldown({ dimension: 'landing', value: item.name, title: `Landing: ${item.name}` })} />}</article>
      <article className="panel"><PanelHead title="Provincias" subtitle="Dirección de envío, con facturación como respaldo" />{data && <RankingBars items={data.geography.provinces} onSelect={(item) => openDrilldown({ dimension: 'province', value: item.name, title: `Provincia: ${item.name}` })} icon={<MapPin />} />}</article>
      <article className="panel wide"><PanelHead title="Ciudades con más pedidos" subtitle="Cantidad, venta neta y ticket promedio" />{data && <RankingTable items={data.geography.cities} onSelect={(item) => openDrilldown({ dimension: 'city', value: item.name, title: `Ciudad: ${item.name}` })} />}</article>
    </div>
    {drilldown && <Modal title={drilldown.title} onClose={() => setDrilldown(null)}>{ordersLoading ? <Loader /> : <div className="drilldown-orders"><div className="drilldown-head"><strong>{orders.length} pedidos encontrados</strong><span>Seleccioná un pedido para abrir su ficha completa · {from} — {to}</span></div><div className="drilldown-table table-head"><span>Pedido</span><span>Cliente</span><span>Fecha</span><span>Estado</span><span>Origen / zona</span><span>Total neto</span><span /></div>{orders.map((order) => <button className="drilldown-table drilldown-row" key={order.id} onClick={() => onSelectOrder(order.id)} aria-label={`Abrir pedido ${order.number || order.id}`}><b>#{order.number || order.id}</b><span>{order.customer}</span><span>{shortDate(order.date_created)}</span><Status value={order.status} /><span>{drilldown.dimension === 'province' || drilldown.dimension === 'city' ? order.city : `${order.source} · ${order.campaign}`}</span><strong>{money(order.total)}</strong><ChevronRight /></button>)}</div>}</Modal>}
  </section>;
}

function EmailMarketingView({ configured }: { configured: boolean }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [comparison, setComparison] = useState<'none' | 'previousMonth' | 'threeMonthAverage' | 'previousYear'>('none');
  const [couponYoY, setCouponYoY] = useState(false);
  const [statuses, setStatuses] = useState(defaultStatuses);
  const [data, setData] = useState<EmailMarketingReport | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [search, setSearch] = useState('');
  const load = () => {
    if (!configured) return;
    setLoading(true); setError('');
    api<EmailMarketingReport>(`/email-marketing?year=${year}&statuses=${statuses.join(',')}`)
      .then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, [configured, year]);
  const coupons = data?.coupons.filter((coupon) => coupon.code.toLocaleLowerCase('es-AR').includes(search.toLocaleLowerCase('es-AR'))) || [];
  const month = data?.months[selectedMonth - 1];
  const baseline = data && month ? marketingBaseline(data, selectedMonth, comparison) : null;
  const comparisonLabel = comparison === 'previousMonth' ? 'Mes anterior' : comparison === 'threeMonthAverage' ? 'Promedio 3 meses anteriores' : comparison === 'previousYear' ? 'Mismo mes del año pasado' : '';
  const metricDelta = (current: number, previous?: number) => comparison === 'none' || previous === undefined ? undefined : percentageChange(current, previous);
  return <section className="page email-page">
    <PageTitle eyebrow="EMAIL + CUPONES" title="Email marketing" subtitle="Ventas atribuibles a emBlue, impacto de ¡hola20%! y evolución mensual de todos los cupones." />
    <div className="date-controls email-controls">
      <label>Año<select value={year} onChange={(e) => { const value = Number(e.target.value); setYear(value); setSelectedMonth(value === currentYear ? new Date().getMonth() + 1 : 12); setComparison('none'); }}>{Array.from({ length: 7 }, (_, index) => currentYear - index).map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Mes analizado<select value={selectedMonth} onChange={(e) => { setSelectedMonth(Number(e.target.value)); setComparison('none'); }}>{monthNames.map((name, index) => <option value={index + 1} key={name}>{name}</option>)}</select></label>
      <button className="primary" onClick={load} disabled={!configured || loading}>{loading ? <RefreshCw className="spin" /> : <RefreshCw />} Actualizar reporte</button>
    </div>
    <StatusFilter value={statuses} onChange={setStatuses} />
    {error && <ErrorBox message={error} />}
    {data && month && <>
      <div className="email-data-note"><Mail /><div><strong>Lectura de emBlue basada en ventas</strong><span>Identificamos email por la atribución guardada en WooCommerce. Enviados, aperturas, clics y bajas requieren conectar la API de emBlue y no se estiman en este reporte.</span></div><b>{data.period.from} — {data.period.to}</b></div>
      <div className="marketing-comparison"><div><strong>Comparar {monthNames[selectedMonth - 1]} de {year}</strong><span>La comparación está apagada por defecto. Activala solo cuando la necesites.</span></div><div className="segment-control"><button className={comparison === 'none' ? 'active' : ''} onClick={() => setComparison('none')}>Sin comparar</button><button className={comparison === 'previousMonth' ? 'active' : ''} onClick={() => setComparison('previousMonth')}>Mes anterior</button><button className={comparison === 'threeMonthAverage' ? 'active' : ''} onClick={() => setComparison('threeMonthAverage')}>Promedio 3 meses</button><button className={comparison === 'previousYear' ? 'active' : ''} onClick={() => setComparison('previousYear')}>Año pasado</button></div></div>
      <div className="metrics-grid email-metrics">
        <Metric label="Ventas atribuidas a email" value={money(month.emailRevenue)} note={`${share(month.emailRevenue, month.storeRevenue)}% de la venta neta de ${month.label}`} delta={metricDelta(month.emailRevenue, baseline?.emailRevenue)} icon={<CircleDollarSign />} accent="forest" />
        <Metric label="Pedidos desde email" value={formatNumber(month.emailOrders)} note={`${share(month.emailOrders, month.storeOrders)}% de los pedidos del mes`} delta={metricDelta(month.emailOrders, baseline?.emailOrders)} icon={<Mail />} accent="blue" />
        <Metric label="Pedidos influenciados" value={formatNumber(month.influencedOrders)} note={`Email atribuido o uso de ${data.primaryCoupon}`} delta={metricDelta(month.influencedOrders, baseline?.influencedOrders)} icon={<Megaphone />} accent="plum" />
        <Metric label="Adopción de cupones" value={`${share(month.couponOrders, month.storeOrders)}%`} note={`${formatNumber(month.couponOrders)} pedidos usaron al menos un cupón`} delta={metricDelta(month.couponOrders, baseline?.couponOrders)} icon={<Tag />} accent="gold" />
      </div>
      <div className="email-highlight">
        <div className="coupon-seal"><Tag /><span>CUPÓN CLAVE</span></div>
        <div><span>Código</span><strong>{data.primaryCoupon}</strong><small>Seguimiento prioritario de email marketing</small></div>
        <EmailStat label="Usos en el mes" value={formatNumber(month.primaryCouponUses)} note={`${share(month.primaryCouponUses, month.storeOrders)}% de pedidos`} previous={baseline ? formatNumber(baseline.primaryCouponUses) : undefined} delta={metricDelta(month.primaryCouponUses, baseline?.primaryCouponUses)} comparisonLabel={comparisonLabel} />
        <EmailStat label="Venta neta asociada" value={money(month.primaryCouponRevenue)} note={`Durante ${month.label}`} previous={baseline ? money(baseline.primaryCouponRevenue) : undefined} delta={metricDelta(month.primaryCouponRevenue, baseline?.primaryCouponRevenue)} comparisonLabel={comparisonLabel} />
        <EmailStat label="Descuento otorgado" value={money(month.primaryCouponDiscount)} note={`Durante ${month.label}`} previous={baseline ? money(baseline.primaryCouponDiscount) : undefined} delta={metricDelta(month.primaryCouponDiscount, baseline?.primaryCouponDiscount)} comparisonLabel={comparisonLabel} />
        <EmailStat label="Clientes" value={formatNumber(month.primaryCouponCustomers)} note="Clientes únicos del mes" previous={baseline ? formatNumber(baseline.primaryCouponCustomers) : undefined} delta={metricDelta(month.primaryCouponCustomers, baseline?.primaryCouponCustomers)} comparisonLabel={comparisonLabel} />
      </div>
      <div className="email-grid">
        <article className="panel wide"><PanelHead title="Pulso mensual" subtitle={`Evolución de ${data.year}; el año anterior solo aparece al elegir esa comparación`} /><MarketingMonthChart months={data.months} showPreviousYear={comparison === 'previousYear'} selectedMonth={selectedMonth} /></article>
        <article className="panel wide coupon-month-panel"><PanelHead title="Detalle de cada mes" subtitle="Números directos para detectar crecimiento o caída" /><MarketingMonthTable months={data.months} showPreviousYear={comparison === 'previousYear'} /></article>
        <EmailAttributionDetail data={data} />
        <article className="panel wide coupon-ranking-panel">
          <div className="coupon-panel-head"><PanelHead title="Rendimiento anual de todos los cupones" subtitle="Usos, clientes, venta asociada y descuentos" /><div className="coupon-actions"><button className={couponYoY ? 'toggle-comparison active' : 'toggle-comparison'} onClick={() => setCouponYoY((value) => !value)}>Comparar con {year - 1}</button><label className="search-box"><Search /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cupón" /></label></div></div>
          <CouponReportTable coupons={coupons} showPreviousYear={couponYoY} />
        </article>
      </div>
      <details className="methodology"><summary>Cómo se calcula este reporte</summary><p>{data.methodology.emailAttribution}</p><p>{data.methodology.influenced}</p><p>{data.methodology.revenue}</p></details>
    </>}
  </section>;
}

function EmailStat({ label, value, note, previous, delta, comparisonLabel }: { label: string; value: string; note: string; previous?: string; delta?: number | null; comparisonLabel: string }) {
  return <div className="email-stat"><span>{label}</span><strong>{value}</strong><small>{delta !== undefined ? <DeltaBadge value={delta} /> : note}</small>{delta !== undefined && previous && <em>{comparisonLabel}: {previous}</em>}</div>;
}

function MarketingMonthChart({ months, showPreviousYear, selectedMonth }: { months: MarketingMonth[]; showPreviousYear: boolean; selectedMonth: number }) {
  const [metric, setMetric] = useState<'influencedOrders' | 'primaryCouponUses' | 'couponUses'>('influencedOrders');
  const labels = { influencedOrders: 'Influencia email', primaryCouponUses: '¡hola20%!', couponUses: 'Todos los cupones' };
  const max = Math.max(1, ...months.flatMap((month) => showPreviousYear ? [month[metric], month.previous[metric]] : [month[metric]]));
  return <div><div className="segment-control email-segments">{(Object.keys(labels) as Array<keyof typeof labels>).map((key) => <button key={key} className={metric === key ? 'active' : ''} onClick={() => setMetric(key)}>{labels[key]}</button>)}</div><div className="month-chart">{months.map((month) => <div className={`month-column ${month.month === selectedMonth ? 'selected' : ''}`} key={month.month} title={showPreviousYear ? `${month.label}: ${month[metric]} vs ${month.previous[metric]}` : `${month.label}: ${month[metric]}`}><div className="month-values"><b>{month[metric]}</b>{showPreviousYear && <small>{month.previous[metric]}</small>}</div><div className="month-bars"><i className="current" style={{ height: `${month[metric] / max * 100}%` }} />{showPreviousYear && <i className="previous" style={{ height: `${month.previous[metric] / max * 100}%` }} />}</div><span>{month.label}</span></div>)}</div><div className="month-legend"><span><i className="current" /> Año seleccionado</span>{showPreviousYear && <span><i /> Año anterior</span>}</div></div>;
}

function MarketingMonthTable({ months, showPreviousYear }: { months: MarketingMonth[]; showPreviousYear: boolean }) {
  return <div className="marketing-month-table"><div className="table-head"><span>Mes</span><span>Email atribuido</span><span>Influencia email</span><span>{'¡hola20%!'}</span><span>Todos los cupones</span><span>Venta influenciada</span></div>{months.map((month) => <div className="marketing-month-row" key={month.month}><strong>{month.label}</strong><MonthCell value={month.emailOrders} delta={showPreviousYear ? month.delta.emailOrders : undefined} /><MonthCell value={month.influencedOrders} delta={showPreviousYear ? month.delta.influencedOrders : undefined} /><MonthCell value={month.primaryCouponUses} delta={showPreviousYear ? month.delta.primaryCouponUses : undefined} /><MonthCell value={month.couponUses} delta={showPreviousYear ? month.delta.couponUses : undefined} /><span className="money-cell">{money(month.influencedRevenue)}</span></div>)}</div>;
}

function MonthCell({ value, delta }: { value: number; delta?: number | null }) { return <span><b>{formatNumber(value)}</b>{delta !== undefined && <small className={delta === null ? 'neutral' : delta >= 0 ? 'up' : 'down'}>{delta === null ? 'nuevo' : `${delta >= 0 ? '+' : ''}${delta}%`}</small>}</span>; }

function CouponReportTable({ coupons, showPreviousYear }: { coupons: EmailMarketingReport['coupons']; showPreviousYear: boolean }) {
  if (!coupons.length) return <Empty icon={<Tag />} text="No hay cupones para mostrar" />;
  return <div className={`coupon-report-table ${showPreviousYear ? '' : 'no-comparison'}`}><div className="table-head"><span>Cupón</span><span>Usos</span>{showPreviousYear && <span>vs. año anterior</span>}<span>Clientes</span><span>Venta neta asociada</span><span>Descuento</span><span>Participación</span></div>{coupons.map((coupon) => <div className={`coupon-report-row ${coupon.key.includes('hola20') ? 'featured' : ''}`} key={coupon.key}><span><strong>{coupon.code}</strong><small>{coupon.firstUsed ? `${coupon.firstUsed} — ${coupon.lastUsed}` : 'Sin usos'}</small></span><b>{formatNumber(coupon.uses)}</b>{showPreviousYear && <DeltaBadge value={coupon.delta.uses} />}<span>{formatNumber(coupon.uniqueCustomers)}</span><strong>{money(coupon.revenue)}</strong><span>{money(coupon.discount)}</span><span>{coupon.usageRate}%</span></div>)}</div>;
}

function EmailAttributionDetail({ data }: { data: EmailMarketingReport }) {
  const [dimension, setDimension] = useState<keyof EmailMarketingReport['emailBreakdown']>('campaigns');
  const labels: Record<keyof EmailMarketingReport['emailBreakdown'], string> = { campaigns: 'Campañas', sources: 'UTM source', mediums: 'UTM medium', sourceMedium: 'Source + medium', landings: 'Landing pages', devices: 'Dispositivos' };
  const items = data.emailBreakdown[dimension]; const total = data.overview.emailAttributed.orders;
  return <article className="panel wide email-attribution-panel">
    <div className="attribution-title"><PanelHead title="Qué aportó más al email" subtitle="Desglose exclusivo de los pedidos identificados como email o emBlue" /><span>{formatNumber(total)} pedidos atribuidos en {data.year}</span></div>
    <div className="utm-coverage"><Coverage label="Source identificado" value={data.emailCoverage.source} /><Coverage label="Medium identificado" value={data.emailCoverage.medium} /><Coverage label="Con campaña UTM" value={data.emailCoverage.campaign} /><Coverage label="Con landing identificada" value={data.emailCoverage.landing} /></div>
    <div className="segment-control attribution-segments">{(Object.keys(labels) as Array<keyof typeof labels>).map((key) => <button key={key} className={dimension === key ? 'active' : ''} onClick={() => setDimension(key)}>{labels[key]}</button>)}</div>
    <div className="email-attribution-table"><div className="table-head"><span>{labels[dimension]}</span><span>Pedidos</span><span>% del email</span><span>Venta neta</span><span>Ticket promedio</span></div>{items.length ? items.map((item) => <div className="email-attribution-row" key={item.name}><span><strong>{item.name}</strong><i><b style={{ width: `${share(item.orders, Math.max(1, total))}%` }} /></i></span><b>{formatNumber(item.orders)}</b><span>{share(item.orders, total)}%</span><strong>{money(item.revenue)}</strong><span>{money(item.averageTicket)}</span></div>) : <Empty icon={<Mail />} text="No hay valores identificados para esta dimensión" />}</div>
  </article>;
}

function Coverage({ label, value }: { label: string; value: number }) { return <div><span>{label}</span><strong>{value}%</strong><i><b style={{ width: `${value}%` }} /></i></div>; }

type MarketingSnapshot = Pick<MarketingMonth, 'emailRevenue' | 'emailOrders' | 'influencedOrders' | 'couponOrders' | 'primaryCouponUses' | 'primaryCouponRevenue' | 'primaryCouponDiscount' | 'primaryCouponCustomers'>;
const marketingKeys: Array<keyof MarketingSnapshot> = ['emailRevenue', 'emailOrders', 'influencedOrders', 'couponOrders', 'primaryCouponUses', 'primaryCouponRevenue', 'primaryCouponDiscount', 'primaryCouponCustomers'];
function marketingBaseline(data: EmailMarketingReport, month: number, comparison: 'none' | 'previousMonth' | 'threeMonthAverage' | 'previousYear'): MarketingSnapshot | null {
  if (comparison === 'none') return null;
  if (comparison === 'previousYear') return data.months[month - 1]?.previous || null;
  const relative = (offset: number) => {
    const index = month - 1 + offset;
    return index >= 0 ? data.months[index] : data.months[12 + index]?.previous;
  };
  const periods = comparison === 'previousMonth' ? [relative(-1)] : [relative(-1), relative(-2), relative(-3)];
  const valid = periods.filter((item): item is NonNullable<typeof item> => Boolean(item));
  if (!valid.length) return null;
  return Object.fromEntries(marketingKeys.map((key) => [key, valid.reduce((sum, item) => sum + item[key], 0) / valid.length])) as MarketingSnapshot;
}
function share(value: number, total: number) { return total ? Math.round(value / total * 10000) / 100 : 0; }
function percentageChange(current: number, previous: number) { return previous ? Math.round((current - previous) / previous * 1000) / 10 : current ? null : 0; }

function AutomationsView({ configured, onSelectOrder }: { configured: boolean; onSelectOrder: (id: number) => void }) {
  const [data, setData] = useState<AutomationJobsResponse | null>(null);
  const [page, setPage] = useState(1); const [status, setStatus] = useState<AutomationStatus | ''>('');
  const [type, setType] = useState<AutomationType | ''>(''); const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  const [error, setError] = useState(''); const [, setClock] = useState(Date.now());
  const load = () => {
    if (!configured) return;
    setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(page), per_page: '20' });
    if (status) params.set('status', status);
    if (type) params.set('type', type);
    if (search.trim()) params.set('search', search.trim());
    api<AutomationJobsResponse>(`/automations/jobs?${params}`)
      .then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, [configured, page, status, type]);
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 60_000); return () => window.clearInterval(timer); }, []);
  const refreshFromFirstPage = () => page === 1 ? load() : setPage(1);
  const summary = data?.summary;
  const postPurchaseConnected = Boolean(data?.mode.connectors?.postPurchase);
  const anyDeliveryConnected = Boolean(data?.mode.connectors && Object.values(data.mode.connectors).some(Boolean));
  return <section className="page automations-page">
    <PageTitle eyebrow="CICLO DE CLIENTES" title="Automatizaciones" subtitle="Seguimiento completo desde la compra procesada hasta el envío a emBlue." />
    {!configured && <ErrorBox message="La base de datos de automatizaciones todavía no está configurada." />}
    {data && <div className={`automation-mode ${anyDeliveryConnected ? 'live' : 'test'}`}>
      <div>{anyDeliveryConnected ? <CheckCircle2 /> : <AlertCircle />}<span><strong>{postPurchaseConnected ? 'Postcompra conectado a emBlue Data Lab' : data.mode.emblueEnabled ? 'emBlue habilitado; Postcompra todavía inactivo' : 'Modo prueba: emBlue desactivado'}</strong><small>{postPurchaseConnected ? 'Los trabajos de Postcompra vencidos se envían automáticamente y quedan auditados.' : 'Los eventos se reciben y programan, pero Postcompra todavía no sale hacia emBlue.'}</small></span></div>
      <span>{data.mode.enabled ? 'Programación activa' : 'Programación inactiva'}</span>
    </div>}
    <div className="metrics-grid automation-metrics">
      <Metric label="Programados" value={summary?.scheduled ?? '—'} note="Esperando su fecha prevista" icon={<Clock />} accent="forest" />
      <Metric label="Listos" value={summary?.ready ?? '—'} note="Fecha alcanzada; pendientes de emBlue" icon={<Mail />} accent="amber" />
      <Metric label="Enviados" value={summary?.sent ?? '—'} note="Entrega registrada correctamente" icon={<CheckCircle2 />} accent="blue" />
      <Metric label="Cancelados o con problema" value={summary ? summary.cancelled + summary.problems : '—'} note="Cancelados, omitidos o fallidos" icon={<AlertCircle />} accent="plum" />
    </div>
    <div className="order-toolbar automation-toolbar">
      <div className="search-box"><Search /><input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && refreshFromFirstPage()} placeholder="Correo, cliente o pedido…" /></div>
      <div className="select-wrap"><select value={type} onChange={(e) => { setType(e.target.value as AutomationType | ''); setPage(1); }}><option value="">Todas las automatizaciones</option><option value="post_purchase">Postcompra</option><option value="cross_sell">Cross-sell</option><option value="win_back">Win-back</option></select><ChevronDown /></div>
      <div className="select-wrap"><select value={status} onChange={(e) => { setStatus(e.target.value as AutomationStatus | ''); setPage(1); }}><option value="">Todos los estados</option><option value="scheduled">Programado</option><option value="ready">Listo</option><option value="processing">Enviando</option><option value="sent">Enviado</option><option value="cancelled">Cancelado</option><option value="skipped">Omitido</option><option value="failed">Fallido</option></select><ChevronDown /></div>
      <button className="primary" onClick={refreshFromFirstPage} disabled={!configured || loading}>{loading ? <RefreshCw className="spin" /> : <RefreshCw />} Actualizar</button>
    </div>
    {error && <ErrorBox message={error} />}
    <div className="table-panel automation-panel">
      <div className="automation-table table-head"><span>Automatización</span><span>Contacto</span><span>Pedido</span><span>Consentimiento</span><span>Estado</span><span>Fecha prevista</span><span>Tiempo restante</span><span /></div>
      {loading ? <Loader /> : data?.data.length ? data.data.map((job) => <Fragment key={job.id}>
        <button className={`automation-table automation-row ${expanded === job.id ? 'open' : ''}`} onClick={() => setExpanded(expanded === job.id ? null : job.id)}>
          <span className={`automation-kind ${job.automation_type}`}><strong>{automationTypeName(job.automation_type)}</strong><small>{automationDelayLabel(job.automation_type)}</small></span>
          <span className="automation-contact"><strong>{[job.first_name, job.last_name].filter(Boolean).join(' ') || 'Sin nombre'}</strong><small>{job.email}</small></span>
          <span className="order-number">#{job.order_number || job.trigger_order_id}</span>
          <AutomationConsent job={job} />
          <AutomationState job={job} deliveryEnabled={automationDeliveryEnabled(job.automation_type, data)} />
          <span>{shortDate(job.due_at)}</span><strong className="remaining">{automationRemaining(job)}</strong><ChevronRight className={expanded === job.id ? 'rotated' : ''} />
        </button>
        {expanded === job.id && <AutomationDetail job={job} deliveryEnabled={automationDeliveryEnabled(job.automation_type, data)} onSelectOrder={onSelectOrder} />}
      </Fragment>) : <Empty icon={<Workflow />} text="No hay automatizaciones con estos filtros" />}
    </div>
    {data && <div className="pagination"><span>{data.total} automatizaciones encontradas · {summary?.post_purchase || 0} postcompra · {summary?.cross_sell || 0} cross-sell · {summary?.win_back || 0} win-back</span><div><button disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft /></button><b>Página {page}</b><button disabled={page * data.perPage >= data.total} onClick={() => setPage(page + 1)}><ChevronRight /></button></div></div>}
  </section>;
}

function AutomationDetail({ job, deliveryEnabled, onSelectOrder }: { job: AutomationJob; deliveryEnabled: boolean; onSelectOrder: (id: number) => void }) {
  const products = job.payload?.products || []; const categories = job.payload?.categories || [];
  const marketingSegments = job.payload?.marketing_categories || ['sin_categoria_clara'];
  return <div className="automation-detail">
    <div className="automation-timeline"><strong>Recorrido</strong><div className="timeline-steps"><span className="done"><i>1</i><b>Compra procesada</b><small>{shortDate(job.processing_at)}</small></span><span className={job.status !== 'cancelled' ? 'done' : ''}><i>2</i><b>Programada</b><small>{shortDate(job.due_at)}</small></span><span className={job.status === 'sent' ? 'done' : job.status === 'failed' ? 'failed' : ''}><i>3</i><b>{deliveryEnabled ? 'Envío a emBlue' : 'emBlue en prueba'}</b><small>{job.sent_at ? shortDate(job.sent_at) : automationRemaining(job)}</small></span></div></div>
    <div className="automation-detail-grid">
      <section><h4>Cliente y consentimiento</h4><Info label="Correo" value={job.email} sensitive /><Info label="Teléfono" value={job.phone} sensitive /><Info label="En este pedido" value={job.order_marketing_opt_in ? 'Aceptó promociones' : 'No marcó la casilla'} /><Info label="Consentimiento general" value={job.current_marketing_opt_in ? 'Activo' : 'No activo'} /><Info label="Otorgado" value={shortDate(job.current_marketing_opt_in_at)} /><Info label="Fuente original" value={job.current_consent_source || job.consent_source || 'No informada'} /></section>
      <section><h4>Pedido disparador</h4><Info label="Pedido" value={`#${job.order_number || job.trigger_order_id}`} /><Info label="Estado actual" value={statusNames[job.order_status || ''] || job.order_status} /><Info label="Fecha de compra" value={shortDate(job.date_created)} /><Info label="Total" value={money(job.total || 0)} /><button className="secondary" onClick={() => onSelectOrder(Number(job.trigger_order_id))}>Abrir pedido completo <ChevronRight /></button></section>
      <section className="automation-products"><h4>Contenido para personalización</h4><small>Segmentación emBlue</small><div className="marketing-primary">Principal: <strong>{marketingCategoryName(job.payload?.primary_marketing_category || marketingSegments[0])}</strong></div><div className="category-tags marketing-tags">{marketingSegments.map((category) => <span key={category}>{marketingCategoryName(category)}</span>)}</div>{categories.length > 0 && <><small>Categorías originales de WooCommerce · solo referencia</small><div className="category-tags">{categories.map((category) => <span key={category}>{category}</span>)}</div></>}{products.length ? products.map((product, index) => <div className="automation-product" key={`${product.product_id}-${product.variation_id}-${index}`}><span><strong>{product.name}</strong><small>{product.sku ? `SKU ${product.sku} · ` : ''}{product.categories?.map((category) => category.name).join(', ') || 'Sin categoría'}</small></span><b>x{product.quantity}</b></div>) : <small>No se guardaron productos en este evento.</small>}</section>
      <section><h4>Diagnóstico</h4><Info label="Intentos" value={String(job.attempts)} /><Info label="Próximo reintento" value={shortDate(job.next_attempt_at || undefined)} /><Info label="Último intento" value={shortDate(job.latest_attempt_at || undefined)} /><Info label="Resultado" value={job.latest_attempt_outcome || 'Sin intentos todavía'} /><Info label="Código HTTP" value={job.latest_attempt_http_status ? String(job.latest_attempt_http_status) : '—'} />{(job.last_error || job.latest_attempt_error) && <div className="automation-error"><AlertCircle />{job.last_error || job.latest_attempt_error}</div>}</section>
    </div>
  </div>;
}

function AutomationState({ job, deliveryEnabled }: { job: AutomationJob; deliveryEnabled: boolean }) {
  const labels: Record<AutomationStatus, string> = { scheduled: 'Programado', ready: deliveryEnabled ? 'Listo' : 'Listo · prueba', processing: 'Enviando', sent: 'Enviado', cancelled: 'Cancelado', skipped: 'Omitido', failed: 'Fallido' };
  return <span className={`automation-state state-${job.status}`}>{labels[job.status]}</span>;
}
function automationDeliveryEnabled(type: AutomationType, data: AutomationJobsResponse) {
  return type === 'post_purchase' ? Boolean(data.mode.connectors?.postPurchase)
    : type === 'cross_sell' ? Boolean(data.mode.connectors?.crossSell) : Boolean(data.mode.connectors?.winBack);
}
function AutomationConsent({ job }: { job: AutomationJob }) {
  const inherited = !job.order_marketing_opt_in && job.current_marketing_opt_in;
  const active = job.order_marketing_opt_in || job.current_marketing_opt_in;
  return <span className={`consent ${active ? 'yes' : 'no'}`}><ShieldCheck />{job.order_marketing_opt_in ? 'Aceptó' : inherited ? 'Consentimiento previo' : 'No aceptó'}<small>{job.automation_type === 'post_purchase' ? 'No requerido para postcompra' : inherited ? 'No marcó en este pedido' : 'No participa'}</small></span>;
}
function automationTypeName(type: AutomationType) { return type === 'post_purchase' ? 'Postcompra' : type === 'cross_sell' ? 'Cross-sell' : 'Win-back'; }
function automationDelayLabel(type: AutomationType) { return type === 'post_purchase' ? '10 días' : type === 'cross_sell' ? '35 días sin recompra' : '90 días sin recompra'; }
function marketingCategoryName(value: string) { return value === 'granolas' ? 'Granolas' : value === 'barras' ? 'Barras' : 'Sin categoría clara'; }
function automationRemaining(job: AutomationJob) {
  if (job.status === 'sent') return 'Enviado';
  if (job.status === 'cancelled') return 'Cancelado';
  if (job.status === 'failed') return 'Requiere revisión';
  const seconds = Math.floor((new Date(job.due_at).getTime() - Date.now()) / 1000);
  if (!Number.isFinite(seconds) || seconds <= 0) return 'Fecha alcanzada';
  const days = Math.floor(seconds / 86_400); const hours = Math.floor((seconds % 86_400) / 3_600); const minutes = Math.max(1, Math.floor((seconds % 3_600) / 60));
  if (days) return `${days} d ${hours} h`;
  if (hours) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

function CapabilitiesView() {
  const [data, setData] = useState<CapabilityResponse | null>(null); const [error, setError] = useState('');
  useEffect(() => { api<CapabilityResponse>('/capabilities').then(setData).catch((e) => setError(e.message)); }, []);
  const groups = useMemo(() => data ? [...new Set(data.capabilities.map((c) => c.group))] : [], [data]);
  return <section className="page">
    <PageTitle eyebrow="MAPA DE DATOS" title="Todo lo que podemos consultar" subtitle="Inventario vivo basado en los endpoints reales de la tienda y el acceso de tu clave." />
    {error && <ErrorBox message={error} />}
    <div className="legend"><span><i className="available" /> Accesible</span><span><i className="pending" /> Falta configurar o probar</span><span><i className="sensitive" /> Contiene datos sensibles</span></div>
    {groups.map((group) => <div className="cap-group" key={group}><h2>{group}</h2><div className="cap-grid">{data?.capabilities.filter((c) => c.group === group).map((cap) => <article className="cap-card" key={cap.id}><div className="cap-icon">{capabilityIcon(cap.id)}</div><div><div className="cap-title"><strong>{cap.title}</strong><AccessBadge status={cap.access?.status} detected={cap.routeDetected} /></div><p>{cap.description}</p><code>GET /wc/v3/{cap.path}</code>{cap.sensitive && <span className="sensitive-label"><LockKeyhole /> Datos sensibles</span>}</div></article>)}</div></div>)}
    <div className="extensions-block"><div><span className="eyebrow">EXTENSIONES DETECTADAS</span><h2>Datos adicionales de plugins</h2><p>Estos módulos existen en Zafrán. Su información puede aparecer en los metadatos estándar o requerir autenticación propia del plugin.</p></div><div className="extension-grid">{data?.extensions.map((ext) => <article key={ext.id} className={!ext.detected ? 'muted' : ''}><span className={ext.detected ? 'detected' : ''}>{ext.detected ? 'Detectado' : 'No detectado'}</span><strong>{ext.title}</strong><p>{ext.description}</p><code>{ext.namespace}</code></article>)}</div></div>
  </section>;
}

function ExplorerView({ configured }: { configured: boolean }) {
  const resources = ['orders', 'products', 'customers', 'coupons', 'refunds', 'categories', 'tags', 'brands', 'reviews', 'reports', 'gateways', 'shipping', 'taxes', 'currencies', 'countries', 'system'];
  const [resource, setResource] = useState('orders'); const [id, setId] = useState(''); const [data, setData] = useState<unknown>(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const run = () => { if (!configured) return; setLoading(true); setError(''); api(`/explorer/${resource}${id ? `?id=${id}` : ''}`).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false)); };
  return <section className="page explorer-page"><PageTitle eyebrow="VISTA SIN FILTROS" title="Explorador de API" subtitle="Inspeccioná la respuesta original sin perder campos desconocidos o agregados por plugins." /><div className="explorer-toolbar"><label>Recurso<select value={resource} onChange={(e) => { setResource(e.target.value); setId(''); }} >{resources.map((r) => <option key={r}>{r}</option>)}</select></label><label>ID específico <input type="number" value={id} onChange={(e) => setId(e.target.value)} placeholder="Opcional" disabled={!['orders', 'products', 'customers', 'coupons'].includes(resource)} /></label><button className="primary" onClick={run} disabled={!configured || loading}>{loading ? <RefreshCw className="spin" /> : <Database />} Consultar</button></div>{error && <ErrorBox message={error} />}<div className="json-shell"><div><span /><span /><span /><b>respuesta.json</b></div>{data ? <pre className="json">{JSON.stringify(data, null, 2)}</pre> : <Empty icon={<FileJson />} text="Elegí un recurso y ejecutá la consulta" />}</div></section>;
}

function PageTitle({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) { return <div className="page-title"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div>; }
function PanelHead({ title, subtitle }: { title: string; subtitle?: string }) { return <div className="panel-head"><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div></div>; }
function Metric({ label, value, note, icon, accent, delta }: { label: string; value: ReactNode; note: string; icon: ReactNode; accent: string; delta?: number | null }) { return <article className={`metric ${accent}`}><div className="metric-icon">{icon}</div><span>{label}</span><strong>{value}</strong><small>{note}</small>{delta !== undefined && <DeltaBadge value={delta} />}</article>; }
function DeltaBadge({ value }: { value: number | null }) { if (value === null) return <span className="delta-badge neutral">Sin base comparable</span>; const positive = value >= 0; return <span className={`delta-badge ${positive ? 'positive' : 'negative'}`}>{positive ? <TrendingUp /> : <TrendingDown />}{positive ? '+' : ''}{value}% vs. período anterior</span>; }
function Delta({ label, value, baseline, delta, moneyValue }: { label: string; value: number; baseline: number; delta: number | null; moneyValue?: boolean }) { const format = (v: number) => moneyValue ? money(v) : new Intl.NumberFormat('es-AR').format(Math.round(v)); return <div className="comparison-stat"><span>{label}</span><strong>{format(value)}</strong><small>Anterior: {format(baseline)}</small><DeltaBadge value={delta} /></div>; }

function ComparisonChart({ current, baseline, currentLabel, baselineLabel }: { current: { date: string; total: number }[]; baseline: { date: string; total: number }[]; currentLabel: string; baselineLabel: string }) {
  const [hovered, setHovered] = useState<{ x: number; y: number; date: string; total: number; series: string } | null>(null);
  const width = 820, height = 230, left = 62, right = 16, top = 18, bottom = 35;
  const max = Math.max(1, ...current.map((p) => p.total), ...baseline.map((p) => p.total));
  const xFor = (index: number, length: number) => left + index / Math.max(1, length - 1) * (width - left - right);
  const yFor = (total: number) => top + (1 - total / max) * (height - top - bottom);
  const points = (series: { total: number }[]) => series.map((item, index) => `${xFor(index, series.length)},${yFor(item.total)}`).join(' ');
  const ticks = [0, .5, 1];
  const showPoint = (item: { date: string; total: number }, index: number, series: { date: string; total: number }[], label: string) => setHovered({ x: xFor(index, series.length), y: yFor(item.total), date: item.date, total: item.total, series: label });
  const tooltipX = hovered ? Math.max(left, Math.min(width - right - 142, hovered.x + (hovered.x > width - 180 ? -146 : 8))) : 0;
  const tooltipY = hovered ? Math.max(top, hovered.y - 47) : 0;
  return <div className="line-chart"><div className="chart-legend"><span><i className="current" /> Actual · {currentLabel}</span>{baseline.length > 0 && <span><i /> Comparación · {baselineLabel}</span>}</div><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={baseline.length ? `Comparación de ventas entre ${currentLabel} y ${baselineLabel}` : `Ventas netas de ${currentLabel}`} onMouseLeave={() => setHovered(null)}><title>Ventas netas diarias; pasá el cursor por cada punto para ver su valor</title>{ticks.map((tick) => { const y = top + (1 - tick) * (height - top - bottom); return <g key={tick}><line x1={left} x2={width - right} y1={y} y2={y} /><text x={left - 8} y={y + 4} textAnchor="end">{compactMoney(max * tick)}</text></g>; })}{baseline.length > 0 && <polyline className="baseline-line" points={points(baseline)} />}<polyline className="current-line" points={points(current)} />{baseline.map((item, i) => <circle key={`baseline-${item.date}`} className="chart-hit" cx={xFor(i, baseline.length)} cy={yFor(item.total)} r="9" onMouseEnter={() => showPoint(item, i, baseline, 'Comparación')} />)}{current.map((item, i) => <g key={item.date}><circle className="current-dot" cx={xFor(i, current.length)} cy={yFor(item.total)} r="3" /><circle className="chart-hit" cx={xFor(i, current.length)} cy={yFor(item.total)} r="10" onMouseEnter={() => showPoint(item, i, current, 'Período actual')} /></g>)}{hovered && <g className="chart-tooltip" pointerEvents="none"><rect x={tooltipX} y={tooltipY} width="138" height="39" rx="6" /><text x={tooltipX + 8} y={tooltipY + 14}>{hovered.series} · {hovered.date}</text><text className="tooltip-value" x={tooltipX + 8} y={tooltipY + 30}>{money(hovered.total)}</text></g>}<text x={left} y={height - 8}>{current[0]?.date || ''}</text><text x={width - right} y={height - 8} textAnchor="end">{current.at(-1)?.date || ''}</text></svg></div>;
}

function FinancialBreakdown({ data }: { data: Dashboard }) {
  const f = data.financials; const subtotalExTax = f.productNetExTax + f.shippingExTax + f.feesExTax;
  return <div className="financial-breakdown"><div className="financial-definition"><strong>Mismo criterio que Informes de WooCommerce</strong><span>Las ventas netas excluyen impuestos y envío. Los reembolsos se descuentan de las ventas brutas.</span></div><div className="financial-row"><span>Total originalmente cobrado</span><b>{money(f.chargedTotal)}</b></div><div className="financial-row negative"><span>Reembolsos</span><b>− {money(f.refunds)}</b></div><div className="financial-row charged"><span>Ventas brutas · WooCommerce</span><b>{money(f.wooGrossSales)}</b></div><div className="financial-row negative"><span>IVA e impuestos</span><b>− {money(f.taxesTotal)}</b></div><div className="financial-row negative"><span>Envíos <small>sin IVA</small></span><b>− {money(f.shippingExTax)}</b></div><div className="financial-row final"><span>Ventas netas · WooCommerce</span><b>{money(f.wooNetSales)}</b></div><div className="financial-row coupon-row"><span>Cupones utilizados <small>ya descontados en las ventas</small></span><b>{money(f.discountsExTax)}</b></div><details><summary>Ver composición comercial adicional</summary><div><span>Productos antes de descuentos <b>{money(f.productSubtotalExTax)}</b></span><span>Productos netos sin IVA <b>{money(f.productNetExTax)}</b></span><span>Subtotal neto sin IVA <b>{money(subtotalExTax)}</b></span><span>IVA de productos <b>{money(f.productTax)}</b></span><span>IVA de envíos <b>{money(f.shippingTax)}</b></span><span>IVA descontado <b>{money(f.discountTax)}</b></span></div></details></div>;
}

function RankingBars({ items, onSelect, icon }: { items: Aggregate[]; onSelect?: (item: Aggregate) => void; icon?: ReactNode }) {
  const max = Math.max(1, ...items.map((item) => item.orders));
  if (!items.length) return <Empty icon={<Activity />} text="Sin datos en este período" />;
  return <div className={`ranking-bars ${onSelect ? 'selectable' : ''}`}>{items.map((item) => { const content = <>{icon && <span className="ranking-icon">{icon}</span>}<span className="ranking-name">{item.name}</span><strong>{item.orders}</strong><div className="ranking-track"><i style={{ width: `${item.orders / max * 100}%` }} /></div><small>{money(item.revenue)}</small></>; return onSelect ? <button key={item.name} onClick={() => onSelect(item)}>{content}<ChevronRight /></button> : <div key={item.name}>{content}</div>; })}</div>;
}

function RankingTable({ items, onSelect }: { items: Aggregate[]; onSelect: (item: Aggregate) => void }) {
  if (!items.length) return <Empty icon={<Activity />} text="Sin datos en este período" />;
  return <div className="ranking-table"><div className="ranking-table-head"><span>Nombre</span><span>Pedidos</span><span>Venta neta</span><span>Ticket</span><span /></div>{items.map((item) => <button key={item.name} onClick={() => onSelect(item)}><span>{item.name}</span><strong>{item.orders}</strong><span>{money(item.revenue)}</span><span>{money(item.averageTicket)}</span><ChevronRight /></button>)}</div>;
}
function compactMoney(value: number) { return new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 }).format(value); }
function formatNumber(value: number) { return new Intl.NumberFormat('es-AR').format(Math.round(value)); }
function shiftDate(value: string, amount: number, unit: 'month' | 'year') { const date = new Date(`${value}T12:00:00Z`); const day = date.getUTCDate(); if (unit === 'year') date.setUTCFullYear(date.getUTCFullYear() + amount); else { date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + amount); const maxDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12)).getUTCDate(); date.setUTCDate(Math.min(day, maxDay)); } return date.toISOString().slice(0, 10); }
function Info({ label, value, sensitive }: { label: string; value?: string; sensitive?: boolean }) { return <div className="info"><span>{label}{sensitive && <LockKeyhole />}</span><strong>{value || '—'}</strong></div>; }
function Status({ value }: { value: string }) { return <span className={`status status-${value}`}>{statusNames[value] || value}</span>; }
function ErrorBox({ message }: { message: string }) { return <div className="error-box"><AlertCircle /> <span>{message}</span></div>; }
function Loader() { return <div className="loader"><RefreshCw className="spin" /> Consultando WooCommerce…</div>; }
function Empty({ icon, text }: { icon: ReactNode; text: string }) { return <div className="empty">{icon}<span>{text}</span></div>; }
function addressText(a?: Order['billing']) { return a ? [a.address_1, a.address_2, a.city, a.state, a.postcode, a.country].filter(Boolean).join(', ') || '—' : '—'; }
function MetaTable({ items }: { items: Meta[] }) { return items.length ? <div className="meta-table">{items.map((item, index) => <div key={`${item.key}-${index}`}><code>{item.key}</code><span>{typeof item.value === 'object' ? JSON.stringify(item.value) : String(item.value || '—')}</span></div>)}</div> : <Empty icon={<Tag />} text="Este pedido no expone metadatos" />; }
function JsonPreview({ data }: { data: unknown }) { return <pre className="mini-json">{JSON.stringify(data, null, 2)}</pre>; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) { return <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal"><header><strong>{title}</strong><button onClick={onClose}><X /></button></header>{children}</div></div>; }
function AccessBadge({ status, detected }: { status?: string; detected: boolean }) { const label = status === 'available' ? 'Accesible' : status === 'forbidden' ? 'Sin permiso' : status === 'error' ? 'Error' : detected ? 'Detectado' : 'No detectado'; return <span className={`access ${status || (detected ? 'pending' : 'error')}`}>{label}</span>; }
function capabilityIcon(id: string) { if (id.includes('order')) return <ShoppingCart />; if (id === 'products' || id === 'variations') return <Boxes />; if (id === 'customers') return <UsersRound />; if (id === 'shipping') return <Truck />; if (id === 'system') return <ServerCog />; if (id === 'reports') return <Activity />; if (id === 'coupons') return <Tag />; return <Database />; }
