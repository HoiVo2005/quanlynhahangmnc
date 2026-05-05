'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/app/context';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { Invoice, Store } from '@/lib/db';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import {
    ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer,
} from 'recharts';
import {
    TrendingUp, Receipt, LayoutDashboard, MonitorPlay, Trash2,
    Calendar, Search, Download, X, ArrowLeft, FileText,
    CheckCircle,
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────────── */

type PeriodType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

/* ─── Constants ──────────────────────────────────────────────── */

const PERIOD_OPTIONS: { id: PeriodType; label: string }[] = [
    { id: 'daily', label: 'Ngày' },
    { id: 'weekly', label: 'Tuần' },
    { id: 'monthly', label: 'Tháng' },
    { id: 'quarterly', label: 'Quý' },
    { id: 'yearly', label: 'Năm' },
];

function getGroupKey(date: Date, period: PeriodType): string {
    if (period === 'daily') return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    if (period === 'weekly') {
        const oneJan = new Date(date.getFullYear(), 0, 1);
        const week = Math.ceil((Math.floor((date.getTime() - oneJan.getTime()) / 864e5) + oneJan.getDay() + 1) / 7);
        return `Tuần ${week}`;
    }
    if (period === 'monthly') return `T${date.getMonth() + 1}`;
    if (period === 'quarterly') return `Q${Math.floor(date.getMonth() / 3) + 1}`;
    return `${date.getFullYear()}`;
}

function fmtVND(n: number) {
    const rounded = Math.ceil(n / 1000) * 1000;
    return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(rounded);
}

/* ─── Sub-components ─────────────────────────────────────────── */

function KpiCard({
    icon, iconBg, label, value, valueColor, sub,
}: {
    icon: React.ReactNode; iconBg: string;
    label: string; value: string; valueColor?: string; sub: string;
}) {
    return (
        <div className="bg-gradient-to-br from-white to-slate-50 rounded-2xl p-6 border border-slate-200 flex items-center gap-4 hover:shadow-lg hover:border-slate-300 transition-all duration-200 group">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg} group-hover:scale-110 transition-transform duration-200`}>
                {icon}
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-2">{label}</p>
                <p className={`text-[18px] font-extrabold leading-tight truncate ${valueColor ?? 'text-slate-900'}`}>{value}</p>
                <p className="text-[9px] font-medium text-slate-400 mt-1">{sub}</p>
            </div>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    return status === 'paid' ? (
        <span className="inline-block px-3 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-bold tracking-wide">
            Đã thanh toán
        </span>
    ) : (
        <span className="inline-block px-3 py-0.5 rounded-full bg-orange-50 text-orange-800 text-[10px] font-bold tracking-wide">
            Chờ
        </span>
    );
}

/* Custom chart tooltip */
const RevenueTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-[12px]">
            <p className="font-bold text-slate-700 mb-1">{label}</p>
            {payload.map((p: any) => (
                <p key={p.name} style={{ color: p.color }} className="font-semibold">
                    {p.name === 'total'
                        ? `Doanh thu: ${fmtVND(p.value)}đ`
                        : `Lượt thuê: ${p.value}`}
                </p>
            ))}
        </div>
    );
};

/* ─── Main Page ──────────────────────────────────────────────── */

export default function ReportsPage() {
    const { user } = useAuth();
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [stores, setStores] = useState<Store[]>([]);
    const [selectedStoreId, setSelectedStoreId] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [reportType, setReportType] = useState<PeriodType>('daily');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    /* ── Fetch ─── */
    useEffect(() => {
        const init = async () => {
            try {
                const res = await fetch('/api/admin/stores');
                let data: Store[] = await res.json();

                // Lọc chi nhánh cho Admin chi nhánh
                if (user?.storeId && user.storeId !== 'all') {
                    data = data.filter((s: Store) => s.id === user.storeId);
                }

                setStores(data);

                const initialStoreId = (user?.storeId && user.storeId !== 'all') ? user.storeId : (data[0]?.id || '');
                if (initialStoreId) {
                    setSelectedStoreId(initialStoreId);
                    await fetchInvoices(initialStoreId);
                }
            } catch {
                toast.error('Không thể tải dữ liệu');
            } finally {
                setIsLoading(false);
            }
        };
        if (user) init();
    }, [user]);

    const fetchInvoices = useCallback(async (storeId: string) => {
        if (!storeId) return;
        try {
            const res = await fetch(`/api/invoices?storeId=${storeId}&includeDeleted=true`, { cache: 'no-store' });
            const data = await res.json();
            setInvoices(data);
        } catch {
            toast.error('Lỗi tải hóa đơn');
        }
    }, []);

    const handleStoreChange = (storeId: string) => {
        setSelectedStoreId(storeId);
        fetchInvoices(storeId);
    };

    /* ── Delete ─── */
    const handleDeleteInvoice = async (id: string) => {
        const result = await Swal.fire({
            title: 'Xóa hóa đơn?',
            text: 'Hành động này không thể hoàn tác.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#6b7280',
            confirmButtonText: 'Xóa',
            cancelButtonText: 'Hủy',
        });
        if (!result.isConfirmed) return;
        try {
            const res = await fetch('/api/invoices', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, permanent: true }),
            });
            if (res.ok) {
                setInvoices(prev => prev.filter(inv => inv.id !== id));
                toast.success('Đã xóa hóa đơn');
            } else {
                toast.error('Lỗi khi xóa hóa đơn');
            }
        } catch {
            toast.error('Lỗi kết nối');
        }
    };

    const handleDeleteAll = async () => {
        if (!invoices.length) return;
        const result = await Swal.fire({
            title: 'Xóa vĩnh viễn tất cả?',
            text: 'Toàn bộ hóa đơn của chi nhánh này sẽ bị xóa và KHÔNG thể khôi phục.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#6b7280',
            confirmButtonText: 'Xóa vĩnh viễn',
            cancelButtonText: 'Hủy',
        });
        if (!result.isConfirmed) return;
        try {
            const res = await fetch('/api/invoices', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ all: true, storeId: selectedStoreId, permanent: true }),
            });
            if (res.ok) {
                setInvoices([]);
                toast.success('Đã xóa toàn bộ hóa đơn');
            } else {
                toast.error('Lỗi khi xóa');
            }
        } catch {
            toast.error('Lỗi kết nối');
        }
    };

    /* ── Derived ─── */

    const filteredInvoices = useMemo(() => {
        return invoices.filter(inv => {
            const id = (inv.id ?? '').toLowerCase();
            if (searchTerm && !id.includes(searchTerm.toLowerCase())) return false;

            const d = new Date(inv.startTime); // Sử dụng Giờ vào
            if (startDate) {
                const s = new Date(startDate);
                s.setHours(0, 0, 0, 0);
                if (d < s) return false;
            }
            if (endDate) {
                const e = new Date(endDate);
                e.setHours(23, 59, 59, 999);
                if (d > e) return false;
            }
            return true;
        });
    }, [invoices, searchTerm, startDate, endDate]);

    const chartData = useMemo(() => {
        const groups: Record<string, { total: number; count: number }> = {};
        filteredInvoices.forEach(inv => {
            if (inv.status !== 'paid') return;
            const key = getGroupKey(new Date(inv.startTime), reportType); // Nhóm theo Giờ vào
            if (!groups[key]) groups[key] = { total: 0, count: 0 };
            groups[key].total += inv.totalPrice;
            // Chỉ tính lượt thuê cho các phòng thực tế (không phải mang về/tặng)
            if (!inv.id.startsWith('TKW') && !inv.id.startsWith('GFT')) {
                groups[key].count += 1;
            }
        });
        return Object.entries(groups).map(([name, data]) => ({ name, ...data }));
    }, [filteredInvoices, reportType]);

    const totalRevenue = useMemo(() =>
        filteredInvoices.reduce((s, inv) => s + inv.totalPrice, 0), [filteredInvoices]);

    const paidInvoices = useMemo(() =>
        filteredInvoices.filter(inv => inv.status === 'paid'), [filteredInvoices]);

    const paidRevenue = useMemo(() =>
        paidInvoices.reduce((s, inv) => s + inv.totalPrice, 0), [paidInvoices]);

    // Lọc riêng danh sách hóa đơn thuê phòng (loại bỏ mang về/tặng) để tính lượt thuê
    const roomHireInvoices = useMemo(() =>
        paidInvoices.filter(inv => !inv.id.startsWith('TKW') && !inv.id.startsWith('GFT')),
        [paidInvoices]);

    const selectedStore = stores.find(s => s.id === selectedStoreId);
    const hasActiveFilters = !!(startDate || endDate || searchTerm);

    /* ── Export ─── */
    const exportToCSV = () => {
        if (!filteredInvoices.length) { toast.error('Không có dữ liệu để xuất'); return; }
        const headers = ['Mã HD', 'Phòng', 'Thời gian', 'Tổng tiền (VNĐ)', 'Trạng thái'];
        const rows = filteredInvoices.map(inv => [
            `#${inv.id.slice(0, 8).toUpperCase()}`,
            `Phòng ${(inv as any).roomNumber ?? ''}`,
            new Date(inv.startTime).toLocaleString('vi-VN'), // In ra giờ vào trong Excel
            Math.ceil(inv.totalPrice / 1000) * 1000,
            inv.status === 'paid' ? 'Đã thanh toán' : 'Chờ',
        ]);
        const csv = '\ufeff' + [headers, ...rows].map(r => r.join(',')).join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        a.download = `hoa-don-${selectedStoreId}-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        toast.success('Xuất file thành công!');
    };

    /* ─────────────────────────────────────────────────────────── */
    /*  RENDER                                                     */
    /* ─────────────────────────────────────────────────────────── */

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100" style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}>

            {/* ── Top bar ── */}
            <header className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 sticky top-0 z-40 h-14 flex items-center justify-between px-7 shadow-lg border-b border-slate-700">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard/admin">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-slate-400 hover:text-white hover:bg-white/10 gap-2 text-[12px] font-semibold rounded-lg transition-all"
                        >
                            <ArrowLeft className="w-4 h-4" /> Quay lại
                        </Button>
                    </Link>
                    <h1 className="text-white text-[15px] font-bold tracking-tight flex items-center gap-2">
                        <Receipt className="w-5 h-5 text-blue-400" />
                        Báo cáo <span className="text-blue-400">Hóa đơn</span>
                    </h1>
                </div>
                <div className="flex items-center gap-2">
                    {invoices.length > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleDeleteAll}
                            className="text-red-400 hover:text-red-300 hover:bg-red-950/20 border border-red-900/50 text-[11px] font-bold gap-2 rounded-lg transition-all"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            Xóa tất cả
                        </Button>
                    )}
                    <Button
                        size="sm"
                        onClick={exportToCSV}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold gap-2 rounded-lg transition-all shadow-md hover:shadow-lg h-9"
                    >
                        <Download className="w-3.5 h-3.5" /> Xuất Excel
                    </Button>
                </div>
            </header>

            {/* ── Filter bar ── */}
            <div className="bg-white border-b border-slate-200 px-7 py-4 flex flex-wrap items-end gap-5 shadow-sm">
                {/* Stores */}
                {stores.length > 1 && (
                    <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Chi nhánh</span>
                        <div className="flex gap-2 flex-wrap">
                            {stores.map(store => (
                                <button
                                    key={store.id}
                                    onClick={() => handleStoreChange(store.id)}
                                    className={`
                                        px-4 py-1.5 rounded-lg text-[12px] font-semibold border transition-all
                                        ${selectedStoreId === store.id
                                            ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white border-blue-700 shadow-md'
                                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300'}
                                    `}
                                >
                                    {store.name}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Date range */}
                <div className="flex items-end gap-3">
                    {[
                        { label: 'Từ ngày', value: startDate, setter: setStartDate },
                        { label: 'Đến ngày', value: endDate, setter: setEndDate },
                    ].map(({ label, value, setter }) => (
                        <div key={label} className="flex flex-col gap-1.5">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                                <Input
                                    type="date"
                                    value={value}
                                    onChange={e => setter(e.target.value)}
                                    className="pl-9 h-9 text-[12px] bg-slate-50 border-slate-200 rounded-lg w-40 focus:bg-white focus:border-blue-400 transition-all"
                                />
                            </div>
                        </div>
                    ))}
                </div>

                {/* Search */}
                <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tìm kiếm ID</span>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                        <Input
                            placeholder="Mã hóa đơn..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="pl-9 h-9 text-[12px] bg-slate-50 border-slate-200 rounded-lg w-44 focus:bg-white focus:border-blue-400 transition-all"
                        />
                    </div>
                </div>

                {/* Period tabs */}
                <div className="flex flex-col gap-1.5 ml-auto">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Chu kỳ biểu đồ</span>
                    <div className="flex bg-slate-100 rounded-lg p-1 gap-1">
                        {PERIOD_OPTIONS.map(opt => (
                            <button
                                key={opt.id}
                                onClick={() => setReportType(opt.id)}
                                className={`
                                    px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all
                                    ${reportType === opt.id
                                        ? 'bg-white text-blue-600 shadow-sm border border-blue-200'
                                        : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}
                                `}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Clear filters */}
                {hasActiveFilters && (
                    <button
                        onClick={() => { setStartDate(''); setEndDate(''); setSearchTerm(''); }}
                        className="self-end mb-0.5 p-2 rounded-lg border border-red-200 bg-white text-red-400 hover:bg-red-50 transition-colors"
                        title="Xóa bộ lọc"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            {/* ── Main content ── */}
            <main className="max-w-[1200px] mx-auto px-7 py-6 space-y-5">

                {/* KPI cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <KpiCard
                        iconBg="bg-blue-50"
                        icon={<TrendingUp className="w-5 h-5 text-blue-600" />}
                        label="Tổng doanh thu"
                        value={`${fmtVND(totalRevenue)}đ`}
                        sub="Tất cả hóa đơn"
                    />
                    <KpiCard
                        iconBg="bg-emerald-50"
                        icon={<CheckCircle className="w-5 h-5 text-emerald-600" />}
                        label="Đã thanh toán"
                        value={`${fmtVND(paidRevenue)}đ`}
                        valueColor="text-emerald-700"
                        sub="Doanh thu thực"
                    />
                    <KpiCard
                        iconBg="bg-orange-50"
                        icon={<MonitorPlay className="w-5 h-5 text-orange-500" />}
                        label="Lượt thuê phòng"
                        value={String(roomHireInvoices.length)}
                        sub="Đã thanh toán"
                    />
                    <KpiCard
                        iconBg="bg-violet-50"
                        icon={<Receipt className="w-5 h-5 text-violet-500" />}
                        label="Tổng hóa đơn"
                        value={String(filteredInvoices.length)}
                        sub="Trong kỳ lọc"
                    />
                </div>

                {/* Revenue chart */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                        <h2 className="text-[13px] font-bold text-slate-800 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-blue-600" />
                            Biểu đồ doanh thu
                        </h2>
                        {/* Chart legend */}
                        <div className="flex items-center gap-4 text-[11px] text-slate-500">
                            <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />
                                Doanh thu
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                                Lượt thuê
                            </span>
                        </div>
                    </div>
                    <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={chartData}>
                                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f3f4f6" />
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 11, fill: '#6b7280', fontFamily: 'Be Vietnam Pro' }}
                                    dy={8}
                                />
                                <YAxis
                                    yAxisId="left"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 10, fill: '#6b7280' }}
                                    tickFormatter={v => `${Math.round(v / 1_000_000)}M`}
                                />
                                <YAxis
                                    yAxisId="right"
                                    orientation="right"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 10, fill: '#f59e0b' }}
                                    tickFormatter={v => `${v} lượt`}
                                />
                                <Tooltip content={<RevenueTooltip />} cursor={{ fill: '#f9fafb' }} />
                                <Bar
                                    yAxisId="left"
                                    dataKey="total"
                                    fill="#3b82f6"
                                    radius={[6, 6, 0, 0]}
                                    barSize={36}
                                />
                                <Line
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="count"
                                    stroke="#f59e0b"
                                    strokeWidth={2.5}
                                    dot={{ r: 4, fill: '#f59e0b', strokeWidth: 0 }}
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Invoice table */}
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <h2 className="text-[13px] font-bold text-slate-800">
                                Danh sách hóa đơn
                                {selectedStore ? ` — ${selectedStore.name}` : ''}
                            </h2>
                            <span className="bg-slate-100 text-slate-600 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                                {filteredInvoices.length}
                            </span>
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="py-12 text-center text-slate-400 text-[13px] italic">Đang tải...</div>
                    ) : filteredInvoices.length === 0 ? (
                        <div className="py-12 text-center text-slate-400 text-[13px] italic">Chưa có hóa đơn nào</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full" style={{ tableLayout: 'fixed' }}>
                                <colgroup>
                                    <col style={{ width: '100px' }} />
                                    <col style={{ width: '110px' }} />
                                    <col style={{ width: '165px' }} />
                                    <col style={{ width: '145px' }} />
                                    <col style={{ width: '120px' }} />
                                    <col style={{ width: '130px' }} />
                                </colgroup>
                                <thead className="bg-slate-50 border-b border-slate-100">
                                    <tr>
                                        {['Mã HD', 'Phòng', 'Thời gian', 'Tổng tiền', 'Trạng thái', 'Thao tác'].map(h => (
                                            <th
                                                key={h}
                                                className="px-4 py-3 text-left text-[9px] font-extrabold text-slate-400 uppercase tracking-widest"
                                            >
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredInvoices.map((invoice, idx) => (
                                        <tr key={invoice.id} className={`transition-colors ${idx % 2 === 0 ? 'hover:bg-blue-50/40' : 'bg-slate-50/50 hover:bg-blue-50/40'
                                            }`}>
                                            <td className="px-4 py-3 font-mono text-[11px] font-semibold text-slate-500">
                                                #{invoice.id.slice(0, 6).toUpperCase()}
                                            </td>
                                            <td className="px-4 py-3 text-[13px] font-bold text-slate-900">
                                                Phòng {(invoice as any).roomNumber}
                                            </td>
                                            <td className="px-4 py-3 text-[11px] text-slate-500">
                                                {new Date(invoice.startTime).toLocaleString('vi-VN')}
                                            </td>
                                            <td className="px-4 py-3 text-[13px] font-bold text-slate-900">
                                                {fmtVND(invoice.totalPrice)}đ
                                            </td>
                                            <td className="px-4 py-3">
                                                <StatusBadge status={invoice.status} />
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <Link href={`/dashboard/invoice/${invoice.id}`}>
                                                        <button className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-blue-600 text-[11px] font-bold hover:bg-blue-50 hover:border-blue-200 transition-all">
                                                            Chi tiết
                                                        </button>
                                                    </Link>
                                                    <button
                                                        onClick={() => handleDeleteInvoice(invoice.id)}
                                                        className="p-1.5 rounded-lg border border-red-100 bg-white text-red-400 hover:bg-red-50 hover:border-red-200 transition-all"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}