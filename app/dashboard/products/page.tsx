'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import { useAuth } from '@/app/context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import { Store } from '@/lib/db';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  ArrowLeft,
  Search,
  Filter,
  Package,
  ShoppingBag,
  Utensils,
  Beaker,
  Layers,
  Store as StoreIcon,
  Upload,
  Apple,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  XCircle,
  TrendingUp,
  Box,
  Pencil,
  Trash2,
} from 'lucide-react';

interface Product {
  id: string;
  storeId: string;
  name: string;
  category: 'food' | 'drink' | 'dry' | 'fruit' | 'other';
  price: number;
  quantity: number;
  note?: string;
  createdAt: Date;
}

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

const categoryOptions = [
  { value: 'food', label: 'Đồ Ăn', icon: <Utensils className="w-4 h-4" />, color: 'bg-orange-400', hex: '#f97316' },
  { value: 'drink', label: 'Đồ uống, bia', icon: <Beaker className="w-4 h-4" />, color: 'bg-blue-500', hex: '#3b82f6' },
  { value: 'dry', label: 'Đồ Khô', icon: <Package className="w-4 h-4" />, color: 'bg-amber-700', hex: '#b45309' },
  { value: 'fruit', label: 'Trái cây', icon: <Apple className="w-4 h-4" />, color: 'bg-emerald-500', hex: '#10b981' },
  { value: 'other', label: 'Khác', icon: <Layers className="w-4 h-4" />, color: 'bg-slate-400', hex: '#94a3b8' },
] as const;

export default function ProductsPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | Product['category']>('all');
  const [pageSize, setPageSize] = useState(10);
  // Per-category page state
  const [pageStates, setPageStates] = useState<Record<string, number>>({});
  const [formData, setFormData] = useState({
    name: '',
    category: 'food' as Product['category'],
    price: '',
    quantity: '',
    note: '',
    logNote: '',
  });

  useEffect(() => {
    if (user?.role === 'admin') {
      router.push('/dashboard/admin');
    }
  }, [user, router]);

  useEffect(() => {
    const fetchStores = async () => {
      try {
        const res = await fetch('/api/admin/stores');
        let data = await res.json();
        if (!Array.isArray(data)) return;
        if (user?.storeId && user?.storeId !== 'all') {
          data = data.filter((store: Store) => store.id === user.storeId);
        }
        setStores(data);
        const userStore = data.find((store: Store) => store.id === user?.storeId);
        setSelectedStoreId(userStore?.id || data[0]?.id || '');
      } catch (error) {
        console.error('Error fetching stores:', error);
      }
    };
    if (user) fetchStores();
  }, [user]);

  useEffect(() => {
    const fetchProducts = async () => {
      if (!selectedStoreId) { setProducts([]); setLoading(false); return; }
      try {
        const res = await fetch(`/api/products?storeId=${selectedStoreId}`);
        const data = await res.json();
        setProducts(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Error fetching products:', error);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, [selectedStoreId]);

  // ─── Excel Import ────────────────────────────────────────────────────
  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedStoreId) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];
        if (jsonData.length === 0) { toast.error('File Excel không có dữ liệu'); return; }

        let successCount = 0;
        toast.info(`Đang xử lý ${jsonData.length} sản phẩm...`);
        let currentInventory = [...products];

        for (const row of jsonData) {
          const name = row['Tên'] || row['name'] || row['Sản phẩm'];
          let categoryFromExcel = String(row['Loại'] || row['category'] || 'food').toLowerCase().trim();
          const price = parseFloat(row['Giá'] || row['price'] || 0);
          const note = row['Ghi chú'] || row['note'] || '';
          if (!name) continue;

          const categoryMap: Record<string, string> = {
            'đồ ăn': 'food', 'thức ăn': 'food', 'đồ uống': 'drink', 'nước': 'drink',
            'bia': 'drink', 'nước ngọt': 'drink', 'đồ khô': 'dry', 'khô': 'dry',
            'trái cây': 'fruit', 'hoa quả': 'fruit', 'khác': 'other',
          };
          let category: Product['category'] = 'food';
          if (categoryMap[categoryFromExcel]) category = categoryMap[categoryFromExcel] as Product['category'];
          else if (['food', 'drink', 'dry', 'fruit', 'other'].includes(categoryFromExcel)) category = categoryFromExcel as Product['category'];

          const rawQty = row['Số Lượng'] || row['Số lượng'] || row['quantity'] || '0';
          const qtyStr = String(rawQty).toLowerCase().trim();
          const unitStr = String(row['Đơn vị'] || row['unit'] || row['ĐVT'] || '').toLowerCase().trim();
          const spec = parseInt(row['Quy cách'] || row['conversion'] || row['Quy đổi'] || 24);
          const isCase = qtyStr.includes('thùng') || unitStr.includes('thùng') || !!row['Số lượng thùng'] || !!row['cases'];
          const match = qtyStr.match(/[\d.]+/);
          let num = match ? parseFloat(match[0]) : (row['Số lượng thùng'] !== undefined ? parseFloat(row['Số lượng thùng'] || 0) : isCase ? 1 : 0);
          const finalQuantity = isCase ? num * spec : num;

          const existing = currentInventory.find(p => p.name.toLowerCase().trim() === (name || '').toString().toLowerCase().trim());
          if (existing) {
            const res = await fetch('/api/products', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: existing.id, name: existing.name, category: category || existing.category, price: price || existing.price, quantity: existing.quantity + finalQuantity, note: note || existing.note, logNote: `Cộng dồn từ Excel (+${finalQuantity})` }),
            });
            if (res.ok) { const updated = await res.json(); currentInventory = currentInventory.map(p => p.id === updated.id ? updated : p); successCount++; }
          } else {
            const res = await fetch('/api/products', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ storeId: selectedStoreId, name, category, price, quantity: finalQuantity, note, logNote: 'Nhập mới từ file Excel' }),
            });
            if (res.ok) { const newlyCreated = await res.json(); currentInventory.push(newlyCreated); successCount++; }
          }
        }
        toast.success(`Đã nhập thành công ${successCount}/${jsonData.length} sản phẩm`);
        const res = await fetch(`/api/products?storeId=${selectedStoreId}`);
        setProducts(await res.json());
      } catch (error) {
        console.error('Excel Import Error:', error);
        toast.error('Lỗi khi đọc file Excel. Vui lòng kiểm tra lại định dạng.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // ─── Dialog ───────────────────────────────────────────────────────────
  const handleOpenDialog = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData({ name: product.name, category: product.category, price: product.price.toString(), quantity: '0', note: product.note || '', logNote: '' });
    } else {
      setEditingProduct(null);
      setFormData({ name: '', category: 'food', price: '', quantity: '', note: '', logNote: '' });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingProduct(null);
    setFormData({ name: '', category: 'food', price: '', quantity: '', note: '', logNote: '' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.price || !formData.quantity) { toast.error('Vui lòng nhập đầy đủ thông tin'); return; }
    if (!selectedStoreId) { toast.error('Chưa chọn quán để lưu sản phẩm'); return; }
    const inputQty = parseInt(formData.quantity, 10);
    try {
      if (editingProduct) {
        const res = await fetch('/api/products', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingProduct.id,
            name: formData.name,
            category: formData.category,
            price: parseFloat(formData.price),
            quantity: inputQty,
            note: formData.note,
            logNote: formData.logNote,
            isRelative: true
          }),
        });
        if (res.ok) { const updated = await res.json(); setProducts(products.map(p => p.id === updated.id ? updated : p)); toast.success('Cập nhật sản phẩm thành công'); handleCloseDialog(); }
      } else {
        const existing = products.find(p => p.name.toLowerCase().trim() === formData.name.toLowerCase().trim());
        if (existing) {
          const res = await fetch('/api/products', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: existing.id, name: formData.name, category: formData.category, price: parseFloat(formData.price), quantity: (existing.quantity || 0) + inputQty, note: formData.note, logNote: formData.logNote || 'Thêm nhanh từ form (Tự động cộng dồn)' }),
          });
          if (res.ok) { const updated = await res.json(); setProducts(products.map(p => p.id === updated.id ? updated : p)); toast.success(`"${formData.name}" đã tồn tại. Đã tự động cộng dồn ${inputQty} vào kho.`); handleCloseDialog(); return; }
        }
        const res = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeId: selectedStoreId, name: formData.name, category: formData.category, price: parseFloat(formData.price), quantity: inputQty, note: formData.note, logNote: formData.logNote }),
        });
        const data = await res.json();
        if (res.ok) { setProducts([...products, data]); toast.success('Thêm sản phẩm thành công'); handleCloseDialog(); }
        else { toast.error(data.error || 'Lỗi khi thêm sản phẩm'); }
      }
    } catch (error) {
      toast.error('Lỗi khi lưu sản phẩm');
    }
  };

  const handleDelete = async (id: string) => {
    const result = await Swal.fire({ title: 'Xóa sản phẩm?', text: 'Hành động này không thể hoàn tác.', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', cancelButtonColor: '#6b7280', confirmButtonText: 'Xóa', cancelButtonText: 'Hủy' });
    if (!result.isConfirmed) return;
    try {
      const res = await fetch(`/api/products?id=${id}`, { method: 'DELETE' });
      if (res.ok) { setProducts(products.filter(p => p.id !== id)); toast.success('Xóa sản phẩm thành công'); }
      else toast.error('Lỗi khi xóa sản phẩm');
    } catch { toast.error('Lỗi khi xóa sản phẩm'); }
  };

  // ─── Helpers ──────────────────────────────────────────────────────────
  const getPage = (key: string) => pageStates[key] ?? 1;
  const setPage = (key: string, page: number) => setPageStates(prev => ({ ...prev, [key]: page }));

  const filteredProducts = (catValue: string) =>
    (Array.isArray(products) ? products : []).filter(p =>
      (catValue === 'all' || p.category === catValue) &&
      p.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

  const paginatedItems = (items: Product[], key: string) => {
    if (pageSize >= 9999) return items;
    const page = getPage(key);
    return items.slice((page - 1) * pageSize, page * pageSize);
  };

  const totalPages = (items: Product[]) =>
    pageSize >= 9999 ? 1 : Math.max(1, Math.ceil(items.length / pageSize));

  // ─── Summary Stats ────────────────────────────────────────────────────
  const allProducts = Array.isArray(products) ? products : [];
  const totalValue = allProducts.reduce((s, p) => s + p.price * p.quantity, 0);
  const lowStockCount = allProducts.filter(p => p.quantity > 0 && p.quantity <= 5).length;
  const outOfStockCount = allProducts.filter(p => p.quantity === 0).length;

  const selectedStore = stores.find(s => s.id === selectedStoreId);

  if (loading) return <div className="p-8 text-center text-slate-500">Đang tải...</div>;

  // ─── Categories to render ─────────────────────────────────────────────
  const catsToRender = activeTab === 'all'
    ? categoryOptions
    : categoryOptions.filter(c => c.value === activeTab);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-4">
          <div className="hidden md:flex items-center gap-3 shrink-0">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <ShoppingBag className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg font-black text-slate-900 tracking-tight uppercase">Thực Đơn & Kho</h1>
          </div>

          <div className="flex-1 max-w-md md:mx-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Tìm nhanh sản phẩm..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-10 h-9 bg-slate-100 border-none rounded-full text-sm w-full"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <p className="hidden sm:block text-xs font-bold text-slate-700 mr-1">{user?.name}</p>
            <Button onClick={() => router.push('/dashboard')} variant="ghost" size="sm" className="text-slate-600 hover:text-indigo-600 gap-1">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden md:inline text-xs">Quay Lại</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-5">

        {/* ── Summary Stats ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Tổng sản phẩm', value: allProducts.length, icon: <Box className="w-4 h-4" />, color: 'text-indigo-600 bg-indigo-50' },
            { label: 'Giá trị tồn kho', value: `${(totalValue / 1_000_000).toFixed(1)}M đ`, icon: <TrendingUp className="w-4 h-4" />, color: 'text-emerald-600 bg-emerald-50' },
            { label: 'Sắp hết hàng', value: `${lowStockCount} món`, icon: <AlertTriangle className="w-4 h-4" />, color: 'text-amber-600 bg-amber-50' },
            { label: 'Hết hàng', value: `${outOfStockCount} món`, icon: <XCircle className="w-4 h-4" />, color: 'text-rose-600 bg-rose-50' },
          ].map(stat => (
            <div key={stat.label} className="bg-white rounded-xl border border-slate-100 p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stat.color}`}>{stat.icon}</div>
              <div>
                <p className="text-xs text-slate-500">{stat.label}</p>
                <p className="text-lg font-black text-slate-900">{stat.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Toolbar ── */}
        <div className="bg-white rounded-xl border border-slate-100 p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <StoreIcon className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-bold text-slate-700">{selectedStore?.name || 'Chưa chọn quán'}</span>
          </div>

          <div className="flex items-center gap-2 ml-auto flex-wrap">
            {/* Page size */}
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPageStates({}); }}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 cursor-pointer"
            >
              {PAGE_SIZE_OPTIONS.map(n => (
                <option key={n} value={n}>{n} / trang</option>
              ))}
              <option value={9999}>Tất cả</option>
            </select>

            {/* Import Excel */}
            <div className="relative">
              <input type="file" accept=".xlsx,.xls" onChange={handleImportExcel} className="absolute inset-0 opacity-0 cursor-pointer" />
              <Button variant="outline" size="sm" className="gap-1.5 border-slate-200 text-slate-600 text-xs">
                <Upload className="w-3.5 h-3.5" />
                Nhập Excel
              </Button>
            </div>

            {/* Add product */}
            <Dialog open={openDialog} onOpenChange={setOpenDialog}>
              <DialogTrigger asChild>
                <Button onClick={() => handleOpenDialog()} size="sm" className="bg-indigo-600 hover:bg-indigo-700 gap-1.5 text-xs">
                  <Plus className="w-3.5 h-3.5" />
                  Thêm sản phẩm
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[440px] rounded-2xl">
                <DialogHeader>
                  <DialogTitle>{editingProduct ? 'Nhập kho / Chỉnh sửa' : 'Thêm Sản Phẩm Mới'}</DialogTitle>
                  <DialogDescription>
                    {editingProduct ? `Đang điều chỉnh: ${editingProduct.name}` : 'Điền thông tin để tạo sản phẩm mới.'}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Tên Sản Phẩm</label>
                    <Input placeholder="Ví dụ: Nước ngọt Coca" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                  </div>

                  {editingProduct && (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-indigo-600 uppercase mb-1.5">Ghi chú nhập/xuất kho</label>
                        <Input placeholder="Ví dụ: Hàng bị vỡ, trả hàng NCC..." value={formData.logNote} onChange={e => setFormData({ ...formData, logNote: e.target.value })} />
                      </div>
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs space-y-1.5">
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold uppercase">Số lượng hiện có:</span>
                          <span className="font-black text-slate-900">{editingProduct.quantity} đơn vị</span>
                        </div>
                        <div className="flex justify-between pt-1.5 border-t border-slate-200">
                          <span className="text-indigo-600 font-bold uppercase">Dự kiến sau nhập:</span>
                          <span className="font-black text-indigo-700">{(editingProduct.quantity || 0) + (parseInt(formData.quantity) || 0)}</span>
                        </div>
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Loại</label>
                    <Select value={formData.category} onValueChange={value => setFormData({ ...formData, category: value as Product['category'] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {categoryOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Giá bán (VNĐ)</label>
                      <Input
                        type="text"
                        placeholder="50000"
                        value={formData.price ? Number(formData.price).toLocaleString('vi-VN') : ''}
                        onChange={e => setFormData({ ...formData, price: e.target.value.replace(/\D/g, '') })}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-indigo-600 uppercase mb-1.5">
                        {editingProduct ? 'Nhập thêm / Xuất' : 'Số lượng kho'}
                      </label>
                      <Input
                        type="number"
                        placeholder={editingProduct ? '0' : '10'}
                        value={formData.quantity}
                        onChange={e => setFormData({ ...formData, quantity: e.target.value })}
                        required
                        className="border-indigo-100 bg-indigo-50 font-bold text-indigo-700"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button type="submit" className="flex-1 bg-indigo-600 font-bold">{editingProduct ? 'Lưu Thay Đổi' : 'Thêm Món'}</Button>
                    <Button type="button" variant="outline" className="flex-1 font-bold" onClick={handleCloseDialog}>Hủy Bỏ</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* ── Store Filter (admin) ── */}
        {user?.role === 'admin' && stores.length > 1 && (
          <div className="bg-white p-3 rounded-xl border border-slate-100 flex items-center gap-3 flex-wrap">
            <Filter className="w-4 h-4 text-slate-400" />
            {stores.map(store => (
              <button
                key={store.id}
                onClick={() => setSelectedStoreId(store.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${selectedStoreId === store.id ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
              >
                {store.name}
              </button>
            ))}
          </div>
        )}

        {/* ── Category Tabs ── */}
        <div className="flex gap-2 flex-wrap">
          {[{ value: 'all', label: 'Tất cả' }, ...categoryOptions].map(cat => {
            const count = cat.value === 'all'
              ? filteredProducts('all').length
              : filteredProducts(cat.value).length;
            return (
              <button
                key={cat.value}
                onClick={() => { setActiveTab(cat.value as any); setPageStates({}); }}
                className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${activeTab === cat.value ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'}`}
              >
                {cat.label}
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${activeTab === cat.value ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Tables ── */}
        {catsToRender.map(cat => {
          const items = filteredProducts(cat.value);
          if (items.length === 0 && activeTab !== 'all') {
            return (
              <div key={cat.value} className="bg-white rounded-xl border border-slate-100 p-10 text-center text-slate-400 text-sm">
                Không tìm thấy sản phẩm nào trong danh mục {cat.label.toLowerCase()}
              </div>
            );
          }
          if (items.length === 0) return null;

          const pageKey = cat.value;
          const curPage = getPage(pageKey);
          const maxPage = totalPages(items);
          const visibleItems = paginatedItems(items, pageKey);
          const catTotalValue = items.reduce((s, p) => s + p.price * p.quantity, 0);
          const start = pageSize >= 9999 ? 1 : (curPage - 1) * pageSize + 1;
          const end = pageSize >= 9999 ? items.length : Math.min(curPage * pageSize, items.length);

          return (
            <div key={cat.value} className="bg-white rounded-xl border border-slate-100 overflow-hidden">
              {/* Section header */}
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 bg-slate-50">
                <div className={`p-1.5 rounded-md text-white ${cat.color}`}>{cat.icon}</div>
                <span className="text-sm font-black text-slate-800 uppercase tracking-tight">{cat.label}</span>
                <span className="text-xs text-slate-400 ml-1">— {items.length} món</span>
                <div className="ml-auto text-xs text-slate-500 hidden sm:block">
                  Tổng tồn kho: <span className="font-bold text-emerald-600">{catTotalValue.toLocaleString('vi-VN')} đ</span>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wide w-8">#</th>
                      <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wide">Tên sản phẩm</th>
                      <th className="px-4 py-2.5 text-right text-xs font-bold text-slate-400 uppercase tracking-wide">Giá bán</th>
                      <th className="px-4 py-2.5 text-center text-xs font-bold text-slate-400 uppercase tracking-wide">Tồn kho</th>
                      {cat.value === 'drink' && (
                        <th className="px-4 py-2.5 text-center text-xs font-bold text-blue-400 uppercase tracking-wide hidden sm:table-cell">
                          Quy đổi thùng
                          <span className="ml-1 text-[10px] font-normal text-slate-300 normal-case">(24 lon)</span>
                        </th>
                      )}
                      <th className="px-4 py-2.5 text-right text-xs font-bold text-slate-400 uppercase tracking-wide hidden md:table-cell">Giá trị tồn</th>
                      <th className="px-4 py-2.5 text-center text-xs font-bold text-slate-400 uppercase tracking-wide">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map((product, idx) => {
                      const rowNum = start + idx;
                      const isLow = product.quantity > 0 && product.quantity <= 5;
                      const isOut = product.quantity === 0;

                      const CASE_SIZE = 24;
                      const cases = Math.floor(product.quantity / CASE_SIZE);
                      const remainder = product.quantity % CASE_SIZE;

                      return (
                        <tr key={product.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors group">
                          <td className="px-4 py-3 text-xs text-slate-300 font-mono">{rowNum}</td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-800">{product.name}</div>
                            {product.note && <div className="text-xs text-slate-400 mt-0.5">{product.note}</div>}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900 tabular-nums">
                            {product.price.toLocaleString('vi-VN')}
                            <span className="text-xs text-slate-400 font-normal ml-0.5">đ</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${isOut ? 'bg-rose-50 text-rose-600' :
                              isLow ? 'bg-amber-50 text-amber-600' :
                                'bg-emerald-50 text-emerald-600'
                              }`}>
                              {isOut ? 'Hết hàng' : isLow ? `⚠ ${product.quantity}` : product.quantity}
                            </span>
                          </td>
                          {cat.value === 'drink' && (
                            <td className="px-4 py-3 text-center hidden sm:table-cell">
                              {isOut ? (
                                <span className="text-xs text-slate-300">—</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold tabular-nums">
                                  {cases > 0 && <span>{cases} thùng</span>}
                                  {cases > 0 && remainder > 0 && <span className="text-blue-300 font-normal">+</span>}
                                  {remainder > 0 && <span>{remainder} lon</span>}
                                  {cases === 0 && remainder === 0 && <span className="text-slate-300">0</span>}
                                </span>
                              )}
                            </td>
                          )}
                          <td className="px-4 py-3 text-right text-xs text-slate-500 tabular-nums hidden md:table-cell">
                            {(product.price * product.quantity).toLocaleString('vi-VN')} đ
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleOpenDialog(product)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-colors"
                              >
                                <Plus className="w-3 h-3" />
                                <span className="hidden sm:inline">Nhập kho</span>
                              </button>
                              <button
                                onClick={() => handleDelete(product.id)}
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:bg-rose-50 hover:text-rose-500 hover:border-rose-200 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {maxPage > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
                  <span className="text-xs text-slate-400">
                    Hiển thị {start}–{end} / {items.length} sản phẩm
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage(pageKey, curPage - 1)}
                      disabled={curPage === 1}
                      className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>

                    {Array.from({ length: maxPage }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === maxPage || Math.abs(p - curPage) <= 1)
                      .reduce<(number | '...')[]>((acc, p, i, arr) => {
                        if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('...');
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((p, i) =>
                        p === '...' ? (
                          <span key={`ellipsis-${i}`} className="px-1 text-xs text-slate-300">…</span>
                        ) : (
                          <button
                            key={p}
                            onClick={() => setPage(pageKey, p as number)}
                            className={`min-w-[28px] h-7 px-2 rounded-lg text-xs font-medium border transition-colors ${curPage === p ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 text-slate-600 hover:bg-white'
                              }`}
                          >
                            {p}
                          </button>
                        )
                      )}

                    <button
                      onClick={() => setPage(pageKey, curPage + 1)}
                      disabled={curPage === maxPage}
                      className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Empty state */}
        {catsToRender.every(cat => filteredProducts(cat.value).length === 0) && (
          <div className="bg-white rounded-xl border border-slate-100 p-16 text-center">
            <Package className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">Không tìm thấy sản phẩm nào</p>
          </div>
        )}
      </div>
    </div>
  );
}