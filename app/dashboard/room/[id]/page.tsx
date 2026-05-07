'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { useAuth } from '@/app/context';
import { Room, RoomSession, Product, OrderItem, Store } from '@/lib/db';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Search, Clock, ShoppingCart, ReceiptText, Trash2, Plus, Minus,
  ChevronLeft, ChevronRight, Grid, Info, CheckCircle2,
  Sandwich, GlassWater, Box, Bath, Expand, X, ArrowRightLeft, Apple, Play, Layers, Users, Package, Edit2
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const DESKTOP_CATEGORIES = [
  { id: 'all', name: 'Tất cả', icon: <Grid className="w-4 h-4" /> },
  { id: 'food', name: 'Đồ ăn', icon: <Sandwich className="w-4 h-4" /> },
  { id: 'drink', name: 'Đồ uống', icon: <GlassWater className="w-4 h-4" /> },
  { id: 'dry', name: 'Đồ khô', icon: <Box className="w-4 h-4" /> },
  { id: 'fruit', name: 'Trái cây', icon: <Apple className="w-4 h-4" /> },
  { id: 'other', name: 'Khác', icon: <Layers className="w-4 h-4" /> },
];

const MOBILE_CATEGORIES = [
  { id: 'all', name: 'Tất cả', icon: <Grid className="w-4 h-4" />, color: 'bg-slate-500' },
  { id: 'food', name: 'Đồ ăn', icon: <Sandwich className="w-4 h-4" />, color: 'bg-rose-500' },
  { id: 'drink', name: 'Đồ uống', icon: <GlassWater className="w-4 h-4" />, color: 'bg-blue-500' },
  { id: 'dry', name: 'Đồ khô', icon: <Box className="w-4 h-4" />, color: 'bg-amber-500' },
  { id: 'fruit', name: 'Trái cây', icon: <Apple className="w-4 h-4" />, color: 'bg-emerald-500' },
  { id: 'other', name: 'Khác', icon: <Layers className="w-4 h-4" />, color: 'bg-slate-500' },
];

// ─── Fetch helper ─────────────────────────────────────────────────────────────

// Tận dụng edge cache (Cache-Control: s-maxage trên server). Helper giữ
// nguyên tên để không phải đổi 7 call sites.
const fetchFresh = (url: string) => fetch(url);

// ─── Hook: detect mobile ──────────────────────────────────────────────────────

function useIsMobile(breakpoint = 1024) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [breakpoint]);
  return isMobile;
}

// ─── Accent removal helper ───────────────────────────────────────────────────

const removeAccents = (str: string) => {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const roomId = params.id as string;
  const isMobile = useIsMobile();

  // ── State ──────────────────────────────────────────────────────────────────
  const [room, setRoom] = useState<Room | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [session, setSession] = useState<RoomSession | null>(null);
  const [voucherCode, setVoucherCode] = useState('');
  const [voucherApplied, setVoucherApplied] = useState(false);
  const VOUCHER_VALID = 'GIAM10';
  const VOUCHER_DISCOUNT = 0.1;
  const [products, setProducts] = useState<Product[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [isManualEndTime, setIsManualEndTime] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [rawStartTime, setRawStartTime] = useState<Date | null>(null);
  const [rawEndTime, setRawEndTime] = useState<Date | null>(null);
  const [customPricePerHour, setCustomPricePerHour] = useState<number>(0);
  const [selectedStartTime, setSelectedStartTime] = useState('');
  const [selectedEndTime, setSelectedEndTime] = useState('');
  const [localItemNotes, setLocalItemNotes] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [editingQuantities, setEditingQuantities] = useState<{ [key: number]: string }>({});
  const [editingPrices, setEditingPrices] = useState<{ [key: number]: string }>({});
  const [editingNames, setEditingNames] = useState<{ [key: number]: string }>({});
  const [editingNotes, setEditingNotes] = useState<{ [key: number]: string }>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showProductSuggestions, setShowProductSuggestions] = useState(false);
  const [showTimeDetails, setShowTimeDetails] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [availableRooms, setAvailableRooms] = useState<Room[]>([]);
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
  const [isEditProductModalOpen, setIsEditProductModalOpen] = useState(false);
  const [editingProductForMenu, setEditingProductForMenu] = useState<Product | null>(null);
  const [isOrderQuantityModalOpen, setIsOrderQuantityModalOpen] = useState(false);
  const [selectedProductForOrder, setSelectedProductForOrder] = useState<Product | null>(null);
  const [orderQuantityInput, setOrderQuantityInput] = useState('1');
  const [allCustomerNames, setAllCustomerNames] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [newProductForm, setNewProductForm] = useState({
    id: '', // Thêm id để tránh lỗi khi tạo mới
    name: '',
    category: 'food',
    price: '',
    quantity: '0'
  });

  const isFirstRender = useRef(true);
  const lastItemRef = useRef<HTMLDivElement>(null); // Ref cho món hàng cuối cùng trong giỏ
  const [lastAddedIndex, setLastAddedIndex] = useState<number | null>(null);
  const processingAddRef = useRef<Set<string>>(new Set());
  const suggestionRefs = useRef<(HTMLLIElement | null)[]>([]);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  // Refs quản lý Debounce để giảm request
  const customerNameDebounceRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const roomPriceDebounceRef = useRef<NodeJS.Timeout | undefined>(undefined);
  // Reset cờ mỗi khi session mới được load
  useEffect(() => {
    isFirstRender.current = true;
  }, [session?.id ?? (session as any)?.Id]);

  // Tải danh sách tên khách hàng cũ để gợi ý
  useEffect(() => {
    const fetchUniqueNames = async () => {
      try {
        const res = await fetch('/api/invoices');
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data?.invoices || data?.data || []);
        const names = Array.from(new Set(
          list
            .filter((inv: any) => {
              const id = inv.id || inv.Id || '';
              return !id.startsWith('TKW') && !id.startsWith('GFT');
            })
            .map((inv: any) => inv.customerName || inv.CustomerName)
            .filter(Boolean)
        )) as string[];
        setAllCustomerNames(names.filter(n => n !== 'Khách lẻ'));
      } catch (e) { console.error('Lỗi lấy danh sách khách hàng:', e); }
    };
    fetchUniqueNames();
  }, []);

  // Cuộn đến item vừa thêm
  useEffect(() => {
    if (lastAddedIndex !== null && itemRefs.current[lastAddedIndex]) {
      itemRefs.current[lastAddedIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setLastAddedIndex(null);
    }
  }, [lastAddedIndex]);

  // Reset refs khi orderItems thay đổi
  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, orderItems.length);
  }, [orderItems.length]);

  // Tự động cuộn khi di chuyển phím mũi tên trong danh sách gợi ý
  useEffect(() => {
    if (selectedIndex >= 0 && suggestionRefs.current[selectedIndex]) {
      suggestionRefs.current[selectedIndex]?.scrollIntoView({
        block: 'nearest',
      });
    }
  }, [selectedIndex]);

  // Ref để theo dõi giá trị rawEndTime mới nhất cho logic so sánh
  const rawEndTimeRef = useRef<Date | null>(null);
  useEffect(() => { rawEndTimeRef.current = rawEndTime; }, [rawEndTime]);

  // Tải/Lưu ghi chú từ localStorage để không bị mất khi reload
  useEffect(() => {
    const sessionId = session?.id ?? (session as any)?.Id;
    if (!sessionId) return;

    const savedNotes = localStorage.getItem(`notes_${sessionId}`);
    if (savedNotes) {
      try { setLocalItemNotes(JSON.parse(savedNotes)); } catch (e) { console.error(e); }
    }

    const savedVoucher = localStorage.getItem(`voucher_${sessionId}`);
    if (savedVoucher) {
      try {
        const parsed = JSON.parse(savedVoucher);
        setVoucherCode(parsed.code || '');
        setVoucherApplied(parsed.applied || false);
      } catch (e) { console.error(e); }
    }
  }, [session?.id ?? (session as any)?.Id]);

  useEffect(() => {
    const sessionId = session?.id ?? (session as any)?.Id;
    if (!sessionId || Object.keys(localItemNotes).length === 0) return;
    localStorage.setItem(`notes_${sessionId}`, JSON.stringify(localItemNotes));
  }, [localItemNotes, session?.id ?? (session as any)?.Id]);

  useEffect(() => {
    const sessionId = session?.id ?? (session as any)?.Id;
    if (!sessionId) return;
    localStorage.setItem(`voucher_${sessionId}`, JSON.stringify({ code: voucherCode, applied: voucherApplied }));
  }, [voucherCode, voucherApplied, session?.id ?? (session as any)?.Id]);

  // Logic lọc gợi ý
  const customerSuggestions = useMemo(() => {
    if (!customerName || customerName.trim().length === 0) return [];
    const search = removeAccents(customerName.toLowerCase());
    return allCustomerNames
      .filter(name => {
        const nameNorm = removeAccents(name.toLowerCase());
        return nameNorm.includes(search) &&
          name.toLowerCase() !== customerName.toLowerCase();
      })
      .slice(0, 5);
  }, [customerName, allCustomerNames]);

  // Stable sort products by ID để giữ menu không nhảy
  const stableSortedProducts = useMemo(() => {
    return [...products].sort((a, b) => {
      const idA = (a.id || (a as any).Id || '').toString();
      const idB = (b.id || (b as any).Id || '').toString();
      return idA.localeCompare(idB);
    });
  }, [products]);

  // Logic lọc gợi ý sản phẩm (Desktop)
  const productSuggestions = useMemo(() => {
    if (!searchTerm || searchTerm.trim().length === 0) return [];
    const search = removeAccents(searchTerm.toLowerCase());
    return stableSortedProducts
      .filter(p => {
        const nameNorm = removeAccents(p.name.toLowerCase());
        return nameNorm.includes(search) &&
          p.name.toLowerCase() !== searchTerm.toLowerCase();
      })
      .slice(0, 8);
  }, [searchTerm, stableSortedProducts]);

  // Hàm đồng bộ tên khách hàng lên server (gọi khi Blur)
  const syncCustomerName = useCallback(async (name: string) => {
    if (!session) return;
    const sessionId = session.id ?? (session as any).Id;
    if (!sessionId) return;

    try {
      await fetch('/api/rooms/session', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sessionId, customerName: name || 'Khách lẻ' }),
      });
    } catch (error) {
      console.error('Lỗi khi đồng bộ tên khách hàng:', error);
    } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Hàm Debounce cho tên khách hàng
  const debouncedSyncCustomerName = useCallback((name: string) => {
    if (customerNameDebounceRef.current) {
      clearTimeout(customerNameDebounceRef.current);
    }
    customerNameDebounceRef.current = setTimeout(() => {
      syncCustomerName(name);
    }, 500); // Đợi 0.5s sau khi ngừng gõ mới gửi request
  }, [syncCustomerName]);

  // Quản lý cờ render lần đầu
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
    }
  }, [session]);

  // Desktop-only state
  const [activeCategory, setActiveCategory] = useState('all');

  // Mobile-only state — chỉ còn 2 tab: cart | menu
  const [mobileTab, setMobileTab] = useState<'menu' | 'cart'>('cart');
  const [mobileCat, setMobileCat] = useState('all');
  const [shouldScrollToLastItem, setShouldScrollToLastItem] = useState(false);

  // Effect để cuộn đến món hàng cuối cùng khi có món mới được thêm
  useEffect(() => {
    if (shouldScrollToLastItem && lastItemRef.current) {
      lastItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      setShouldScrollToLastItem(false); // Reset cờ
    }
  }, [shouldScrollToLastItem, orderItems]); // orderItems là dependency để đảm bảo ref đã được gán

  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;

  // ── Helpers ────────────────────────────────────────────────────────────────

  const formatDateTimeLocal = (date: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };


  // ── Đồng bộ giá giờ lên server ─────────────────────────────────────────────
  const isFirstRenderPrice = useRef(true);

  useEffect(() => {
    isFirstRenderPrice.current = true;
  }, [session?.id ?? (session as any)?.Id]);

  // Hàm đồng bộ giá phòng (gọi khi Blur)
  const syncRoomPrice = useCallback(async (price: number) => {
    if (!room) return;

    try {
      const res = await fetch('/api/admin/rooms', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: String(room.id ?? (room as any).Id),
          roomNumber: room.roomNumber,
          capacity: room.capacity,
          pricePerHour: price,
          status: room.status,
        }),
      });
      if (res.ok) {
        setRoom(prev => prev ? { ...prev, pricePerHour: price } : prev);
      }
    } catch (err) { // eslint-disable-next-line react-hooks/exhaustive-deps
      console.error('Lỗi khi cập nhật giá phòng:', err);
    }
  }, [room]);

  // Hàm Debounce cho giá phòng
  const debouncedSyncRoomPrice = useCallback((price: number) => {
    if (roomPriceDebounceRef.current) {
      clearTimeout(roomPriceDebounceRef.current);
    }
    roomPriceDebounceRef.current = setTimeout(() => {
      syncRoomPrice(price);
    }, 500);
  }, [syncRoomPrice]);

  // ── Real-time timer: Auto-update end time during active sessions ────────────
  useEffect(() => {
    // Check if session exists and is in active status
    if (!session) return;

    const sessionStatus = session.status ?? (session as any).Status;

    // Chỉ chạy timer nếu trạng thái là 'active' và KHÔNG đang sửa thủ công
    if (sessionStatus !== 'active' || isManualEndTime) {
      return;
    }

    const timerInterval = setInterval(() => {
      const now = new Date();
      setSelectedEndTime(formatDateTimeLocal(now));
      setRawEndTime(now);
    }, 1000); // Update every 100ms to match order polling interval

    return () => clearInterval(timerInterval);
  }, [session?.id ?? (session as any)?.Id, session?.status ?? (session as any)?.Status, isManualEndTime]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Data loading ───────────────────────────────────────────────────────────

  const loadRoomData = async (currentRoomId: string) => {
    try {
      const roomsRes = await fetchFresh(`/api/admin/rooms`);
      const rooms = await roomsRes.json();
      const foundRoom = rooms.find(
        (r: Room) => String(r.id ?? (r as any).Id) === String(currentRoomId)
      );

      if (!foundRoom) {
        setCustomPricePerHour(0); setRoom(null); setSession(null);
        setOrderItems([]); setSelectedStartTime(''); setSelectedEndTime(''); setProducts([]);
        return;
      }

      setRoom(foundRoom);
      setCustomPricePerHour(foundRoom.pricePerHour);

      const storesRes = await fetchFresh(`/api/admin/stores`);
      const storesData = await storesRes.json();
      setStore(storesData.find((s: Store) => String(s.id ?? (s as any).Id) === String(foundRoom.storeId)) || null);

      const productsRes = await fetchFresh(`/api/products?storeId=${foundRoom.storeId}`);
      const productsData = await productsRes.json();
      setProducts(Array.isArray(productsData) ? productsData : []);

      if (foundRoom.status === 'occupied') {
        const sessionRes = await fetchFresh(`/api/rooms/session?roomId=${currentRoomId}`);
        if (sessionRes.ok) {
          const sessionData = await sessionRes.json();

          // Kiểm tra xem người dùng có đang tập trung vào ô nhập liệu giờ không
          const activeEl = document.activeElement;
          const isTypingTime = activeEl instanceof HTMLInputElement && activeEl.type === 'datetime-local';

          const sessionId = sessionData?.id ?? (sessionData as any)?.Id;
          if (sessionId) {
            setSession(sessionData);
            setCustomerName(sessionData.customerName ?? (sessionData as any).CustomerName ?? '');
            const start = new Date(sessionData.startTime || (sessionData as any).StartTime || new Date());
            setSelectedStartTime(formatDateTimeLocal(start));
            setRawStartTime(start);

            // Kiểm tra nếu trên server đã có giờ ra dự kiến được lưu
            const savedEnd = sessionData.endTime || (sessionData as any).EndTime;
            const isPausedServer = sessionData.status === 'paused' || (sessionData as any).Status === 'paused';

            if (savedEnd || isPausedServer) {
              const endValue = savedEnd ? new Date(savedEnd) : new Date(sessionData.updatedAt || (sessionData as any).UpdatedAt || new Date());

              setIsManualEndTime(true); // Khóa timer vì đang tạm tính hoặc có giờ thủ công

              // Chỉ ghi đè vào ô nhập liệu nếu người dùng không đang gõ
              if (!isTypingTime) {
                setSelectedEndTime(formatDateTimeLocal(endValue));
                setRawEndTime(endValue);
              }
            } else {
              // Nếu chưa có, tính toán theo trạng thái (paused thì lấy lúc dừng, active lấy hiện tại)
              const end = sessionData.status === 'paused' || (sessionData as any).Status === 'paused' ? new Date(sessionData.updatedAt || (sessionData as any).UpdatedAt || new Date()) : new Date();
              setSelectedEndTime(formatDateTimeLocal(end));
              setRawEndTime(end);
              setIsManualEndTime(false);
            }
            const ordersRes = await fetchFresh(`/api/orders?sessionId=${sessionId}`);
            const ordersData = await ordersRes.json();
            const sortedOrders = Array.isArray(ordersData)
              ? [...ordersData].sort((a, b) =>
                new Date(a.orderedAt || a.OrderedAt || 0).getTime() -
                new Date(b.orderedAt || b.OrderedAt || 0).getTime()
              )
              : [];

            setOrderItems(sortedOrders);
            return;
          }
        }
      }

      setSession(null); setOrderItems([]); setSelectedStartTime(''); setSelectedEndTime('');
    } catch (err) {
      console.error('Error loading room data:', err);
      toast.error('Không thể tải dữ liệu phòng');
    }
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setIsLoading(true);
      setRoom(null); setStore(null); setSession(null); setOrderItems([]);
      setSelectedStartTime(''); setSelectedEndTime(''); setProducts([]);
      setSearchTerm(''); setActiveCategory('all'); setMobileCat('all');
      setEditingQuantities({}); setCustomPricePerHour(0);
      await loadRoomData(roomId);
      if (!cancelled) setIsLoading(false);
    };
    run();
    return () => { cancelled = true; };
  }, [roomId, user?.id, user?.storeId]); // Tối ưu: Chỉ load lại khi ID người dùng hoặc chi nhánh thay đổi

  const lastLoadTimeRef = useRef(0);
  useEffect(() => {
    const handleFocus = () => {
      // Giới hạn tần suất load dữ liệu khi focus tab (tối thiểu 60s/lần)
      const now = Date.now();
      if (now - lastLoadTimeRef.current > 60000) {
        loadRoomData(roomIdRef.current);
        lastLoadTimeRef.current = now;
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling để tự động cập nhật giá giỏ hàng mỗi 0.1 giây nếu có session active
  // Chỉ cập nhật giá, không reload products để giữ menu ổn định
  const orderItemsRef = useRef(orderItems);

  useEffect(() => {
    orderItemsRef.current = orderItems;
  }, [orderItems]);

  useEffect(() => {
    // Chỉ Polling nếu session đang active. 
    // Nếu đang Paused (tạm tính) thì không cần cập nhật liên tục.
    const sessionStatus = session?.status ?? (session as any)?.Status;
    // Nếu phòng đang 'pending' (chưa bắt đầu tính giờ) hoặc 'paused' (tạm tính), 
    // không cần poll liên tục.
    if (!session || !products.length || sessionStatus !== 'active') return;

    const interval = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;

      try {
        const sessionId = session.id ?? (session as any).Id;
        if (!sessionId) return;

        const ordersRes = await fetchFresh(`/api/orders?sessionId=${sessionId}`);
        if (ordersRes.ok) {
          const ordersData = await ordersRes.json();
          if (Array.isArray(ordersData)) {
            const sortedOrders = [...ordersData].sort((a, b) =>
              new Date(a.orderedAt || a.OrderedAt || 0).getTime() -
              new Date(b.orderedAt || b.OrderedAt || 0).getTime()
            );

            // Chỉ update nếu có sự thay đổi về giá hoặc số lượng
            const needsUpdate = sortedOrders.some((newItem, idx) => {
              const oldItem = orderItemsRef.current[idx];
              return !oldItem ||
                newItem.price !== oldItem.price ||
                newItem.quantity !== oldItem.quantity;
            });

            if (needsUpdate) {
              setOrderItems(sortedOrders);
            }
          }
        }
      } catch (err) {
        console.error('Error polling order items:', err);
      }
    }, 45000); // Tăng lên 45 giây. Nhân viên có thể nhấn nút "Thanh toán" để xem giá mới nhất thay vì đợi máy.

    return () => clearInterval(interval);
  }, [session, products]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleStartSession = async () => {
    if (!room) return;
    const rId = room.id ?? (room as any).Id;
    const sId = room.storeId ?? (room as any).StoreId;
    try {
      const res = await fetch('/api/rooms/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: rId, storeId: sId }),
      });
      if (res.ok) {
        const newSession = await res.json();
        setSession(newSession); setOrderItems([]);
        const start = new Date(newSession.startTime || newSession.StartTime || new Date());
        setSelectedStartTime(formatDateTimeLocal(start));
        setRawStartTime(start);
        setSelectedEndTime(formatDateTimeLocal(start));
        setRawEndTime(start);
        setIsManualEndTime(false);
        await fetch('/api/admin/rooms', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: rId, roomNumber: room.roomNumber, capacity: room.capacity, pricePerHour: room.pricePerHour, status: 'occupied' }),
        });
        setRoom({ ...room, status: 'occupied' });
      } else {
        toast.error('Không thể mở phòng. Vui lòng thử lại.');
      }
    } catch (err) { console.error('Error starting session:', err); }
  };

  const handleStartTimeChange = async (newVal: string) => {
    setSelectedStartTime(newVal);
    setRawStartTime(new Date(newVal));
    if (!session || !room || !newVal) return;

    const s = session as any;
    const sessionId = String(s.id ?? s.Id);
    const startTimeToSet = new Date(newVal);

    if (isNaN(startTimeToSet.getTime())) return;

    try {
      const res = await fetch('/api/rooms/session', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: sessionId,
          roomId: String(room.id ?? (room as any).Id),
          startTime: startTimeToSet.toISOString(),
          status: 'active',
          customerName: customerName || 'Khách lẻ'
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setSession(updated);
        toast.success('Đã cập nhật giờ vào');
      }
    } catch (err) { console.error('Error auto-updating start time:', err); }
  };

  const handleEndTimeChange = async (newVal: string) => {
    setSelectedEndTime(newVal);

    if (!session || !newVal) return;
    const sessionId = session.id ?? (session as any).Id;

    const selectedTime = new Date(newVal);
    setRawEndTime(selectedTime); // Cập nhật ngay lập tức để logic tính tiền nhận giá trị mới

    // Giờ được chọn > hiện tại => lưu thủ công
    setIsManualEndTime(true);
    try {
      const res = await fetch('/api/rooms/session', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: sessionId,
          endTime: selectedTime.toISOString()
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSession(updated);
      }
    } catch (err) {
      console.error('Lỗi khi lưu giờ ra dự kiến:', err);
    }
  };

  const handleResetManualEndTime = async () => {
    if (!session) return;
    const sessionId = session.id ?? (session as any).Id;
    try {
      const res = await fetch('/api/rooms/session', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sessionId, endTime: null }),
      });

      if (res.ok) {
        const updated = await res.json();
        // Cập nhật session ngay lập tức với endTime = null
        setSession(prev => prev ? { ...prev, endTime: null } : updated);
        setIsManualEndTime(false); // Tắt chế độ thủ công để timer bắt đầu chạy
        const now = new Date();
        setSelectedEndTime(formatDateTimeLocal(now)); // Reset hiển thị ngay lập tức
        setRawEndTime(now);

        toast.success('Đã đặt lại giờ ra theo thời gian thực');
        // Tải lại dữ liệu sau một khoảng ngắn để đảm bảo đồng bộ hoàn toàn với DB
        setTimeout(() => loadRoomData(roomId), 100);
      }
    } catch (err) { console.error('Lỗi khi đặt lại giờ:', err); }
  };

  const handleUpdateStartTime = async () => {
    const s = session as any;
    if (!s || !room || !(s.id ?? s.Id)) {
      toast.error('Không tìm thấy phiên hoạt động để bắt đầu');
      return;
    }

    const sessionId = String(s.id ?? s.Id);

    if (s.status === 'active' || s.Status === 'active') {
      const result = await Swal.fire({
        title: 'Xử lý giờ chơi',
        html: `Bạn muốn xóa giờ để quay về trạng thái chờ?`,
        icon: 'question',
        showConfirmButton: false,
        showCancelButton: true,
        showDenyButton: true,
        denyButtonColor: '#f59e0b',
        denyButtonText: 'Xóa giờ (về Chờ)',
        cancelButtonText: 'Đóng',
      });

      if (result.isDenied) {
        await updateSessionStatus(sessionId, 'pending');
        toast.success('Đã xóa giờ chơi, phòng đang ở trạng thái chờ');
        return;
      }
      if (!result.isConfirmed) return;
    }

    const isPending = s.status === 'pending' || s.Status === 'pending';
    const startTimeToSet = isPending ? new Date() : (selectedStartTime ? new Date(selectedStartTime) : new Date());

    try {
      if (!isManualEndTime) setSelectedEndTime(formatDateTimeLocal(new Date()));

      const res = await fetch('/api/rooms/session', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: sessionId,
          roomId: String(room.id ?? (room as any).Id),
          startTime: startTimeToSet.toISOString(),
          status: 'active'
        }),
      });

      if (res.ok) {
        toast.success(s.status === 'active' || s.Status === 'active' ? 'Đã cập nhật giờ vào' : 'Đã bắt đầu tính tiền giờ');
        await loadRoomData(roomId);
      } else {
        toast.error('Không thể cập nhật thời gian');
      }
    } catch (err) { console.error('Error updating start time:', err); }
  };

  const updateSessionStatus = async (sessionId: string, status: string) => {
    try {
      const res = await fetch('/api/rooms/session', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sessionId, status }),
      });
      if (res.ok) {
        await loadRoomData(roomId);
      }
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  const handlePauseSession = async () => {
    if (!session || !room) return;
    const sessionId = session.id ?? (session as any).Id;
    const now = new Date();

    // Cập nhật trạng thái local ngay lập tức
    // Đặt isManualEndTime = true để dừng timer
    // Đặt endTime = now để cố định giờ tạm tính
    setSession(prev => prev ? { ...prev, status: 'paused', endTime: now } : null);
    setIsManualEndTime(true); // Ensure timer stops
    setSelectedEndTime(formatDateTimeLocal(now)); // Update display
    setRawEndTime(now); // Update raw value for calculations

    try {
      const res = await fetch('/api/rooms/session', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: sessionId,
          status: 'paused',
          endTime: now.toISOString()
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        // Ensure local state is fully consistent with server, including endTime
        setSession(prev => prev ? { ...prev, ...updated, status: 'paused', endTime: new Date(updated.endTime || updated.EndTime || now) } : updated);
      }
    } catch (err) { console.error(err); }
  };

  const handleResumeSession = async () => {
    if (!session || !room) return;
    const sessionId = session.id ?? (session as any).Id;

    const result = await Swal.fire({
      title: 'Tiếp tục chơi?',
      text: 'Bạn có muốn tiếp tục tính tiền giờ cho phòng này không?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#059669',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Tiếp tục',
      cancelButtonText: 'Hủy',
    });

    if (!result.isConfirmed) return;

    const now = new Date();
    try {
      // Khi nhấn tiếp tục, ta xóa luôn giờ kết thúc cố định (endTime: null) 
      // để hệ thống tự động quay lại chế độ chạy theo thời gian thực
      const res = await fetch('/api/rooms/session', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: sessionId,
          status: 'active',
          endTime: null
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setSession({ ...updated, status: 'active', endTime: null } as any);

        // Tắt chế độ thủ công và cập nhật giờ hiện tại ngay lập tức
        setIsManualEndTime(false);
        setSelectedEndTime(formatDateTimeLocal(now));
        setRawEndTime(now);

        toast.success('Đã tiếp tục tính tiền giờ theo máy');
      }
    } catch (err) { console.error(err); }
  };

  const handleCancelSession = async () => {
    if (!session || !room) return;
    const sessionId = session.id ?? (session as any).Id;
    const result = await Swal.fire({
      title: 'Xác nhận hủy phòng?', text: 'Toàn bộ giờ chơi và đơn hàng sẽ bị hủy. Bạn có chắc chắn?',
      icon: 'warning', showCancelButton: true,
      confirmButtonColor: '#ef4444', cancelButtonColor: '#6b7280',
      confirmButtonText: 'Đồng ý, hủy phòng', cancelButtonText: 'Không, quay lại',
    });
    if (!result.isConfirmed) return;
    try {
      // API này cần phải xử lý việc cộng trả lại số lượng sản phẩm vào kho
      await fetch('/api/rooms/session', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sessionId, status: 'cancelled' }),
      });
      const rId = room.id ?? (room as any).Id;
      const res = await fetch('/api/admin/rooms', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rId, roomNumber: room.roomNumber, capacity: room.capacity, pricePerHour: room.pricePerHour, status: 'empty' }),
      });
      if (res.ok) { toast.success('Đã hủy phòng và đưa về trạng thái trống'); router.push('/dashboard'); }
      else toast.error('Lỗi khi hủy phòng');
    } catch (err) { console.error('Error canceling room:', err); toast.error('Lỗi kết nối máy chủ'); }
  };

  const openTransferModal = async () => {
    try {
      if (!room) return;
      const currentStoreId = room.storeId ?? (room as any).StoreId;
      const roomsRes = await fetchFresh(`/api/admin/rooms?storeId=${currentStoreId}`);
      const roomsData = await roomsRes.json();
      const rId = room.id ?? (room as any).Id;
      const emptyOnes = roomsData.filter((r: any) =>
        (r.status === 'empty' || r.Status === 'empty') &&
        String(r.id ?? r.Id) !== String(rId) &&
        String(r.storeId ?? r.StoreId) === String(currentStoreId)
      );
      const mappedRooms = emptyOnes.map((r: any) => ({
        ...r,
        id: r.id ?? r.Id,
        roomNumber: r.roomNumber ?? r.RoomNumber,
        capacity: r.capacity ?? r.Capacity
      }));

      mappedRooms.sort((a: any, b: any) =>
        String(a.roomNumber).localeCompare(String(b.roomNumber), undefined, { numeric: true })
      );

      setAvailableRooms(mappedRooms);
      setIsTransferModalOpen(true);
    } catch (err) {
      toast.error('Không thể tải danh sách phòng trống');
    }
  };

  const handleTransferRoom = async (newRoomId: string) => {
    if (!session || !room) return;
    const sessionId = session.id ?? (session as any).Id;
    const rId = room.id ?? (room as any).Id;

    const result = await Swal.fire({
      title: 'Xác nhận chuyển phòng?',
      text: `Toàn bộ giờ chơi và hóa đơn sẽ được chuyển sang phòng mới. Bạn có chắc chắn?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#4f46e5',
      confirmButtonText: 'Đồng ý chuyển',
      cancelButtonText: 'Hủy',
    });

    if (!result.isConfirmed) return;

    try {
      const res = await fetch('/api/rooms/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: String(sessionId), oldRoomId: String(rId), newRoomId: String(newRoomId) }),
      });

      const contentType = res.headers.get('content-type');
      let data;
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        throw new Error('Máy chủ phản hồi không đúng định dạng');
      }

      if (res.ok) {
        toast.success('Đã chuyển phòng thành công');
        router.push(`/dashboard/room/${newRoomId}`);
      } else {
        toast.error(data.error || 'Lỗi khi chuyển phòng');
      }
    } catch (err: any) {
      console.error('Error transferring room:', err);
      toast.error(err.message === 'Máy chủ phản hồi không đúng định dạng' ? 'Lỗi máy chủ (API Error)' : 'Lỗi kết nối máy chủ');
    }
  };

  const handleOpenEditProduct = (product: Product) => {
    setEditingProductForMenu(product);
    setNewProductForm({
      id: product.id,
      name: product.name,
      category: product.category,
      price: product.price.toString(),
      quantity: product.quantity.toString()
    });
    setIsEditProductModalOpen(true);
  };

  const handleUpdateProductFromMenu = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProductForMenu || !room) return;
    try {
      const res = await fetch('/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingProductForMenu.id,
          name: newProductForm.name,
          category: newProductForm.category,
          price: parseFloat(newProductForm.price),
          quantity: parseInt(newProductForm.quantity) || editingProductForMenu.quantity,
          logNote: `Sửa nhanh từ phòng ${room.roomNumber}`,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setProducts(prev => prev.map(p => p.id === updated.id ? updated : p));

        // Đồng bộ giá mới vào các món đã có trong giỏ hàng của phòng này
        const newPrice = updated.price;
        for (let i = 0; i < orderItems.length; i++) {
          if (orderItems[i].productId === updated.id && orderItems[i].price !== newPrice) {
            await handleUpdateOrderItem(i, { price: newPrice });
          }
        }

        setIsEditProductModalOpen(false);
        toast.success('Đã cập nhật sản phẩm và đồng bộ giá giỏ hàng');
      } else toast.error('Lỗi khi cập nhật sản phẩm');
    } catch (err) { toast.error('Lỗi kết nối máy chủ'); }
  };

  const handleOpenOrderQuantityModal = (product: Product) => {
    setSelectedProductForOrder(product);
    // Tìm xem sản phẩm này đã có trong giỏ hàng chưa
    const existingItem = orderItems.find(item => item.productId === product.id);
    // Nếu có rồi thì hiển thị số lượng hiện tại, nếu chưa có thì để 1
    setOrderQuantityInput(existingItem ? existingItem.quantity.toString() : '1');
    setIsOrderQuantityModalOpen(true);
  };

  const handleConfirmOrderQuantity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductForOrder) return;
    const qty = parseInt(orderQuantityInput);
    if (isNaN(qty) || qty < 0) {
      toast.error('Số lượng không hợp lệ');
      return;
    }

    const existingIndex = orderItems.findIndex(item => item.productId === selectedProductForOrder.id);
    if (existingIndex !== -1) {
      // Nếu đã có trong giỏ, cập nhật về số lượng mới (ghi đè)
      handleUpdateOrderItem(existingIndex, { quantity: qty, price: orderItems[existingIndex].price });
    } else if (qty > 0) {
      // Nếu chưa có, thêm mới vào giỏ
      handleAddProduct(selectedProductForOrder.id, qty);
    }
    setIsOrderQuantityModalOpen(false);
  };

  const handleAddProduct = async (productId: string, quantity: number) => {
    if (!session) return;

    // Chống spam click hoặc click nhanh gây ra tình trạng tạo 2 dòng thay vì cộng dồn (x2)
    if (processingAddRef.current.has(productId)) return;

    const currentOrders = orderItemsRef.current;
    const existingIndex = currentOrders.findIndex((item) => item.productId === productId);
    const existing = existingIndex !== -1 ? currentOrders[existingIndex] : null;
    const product = products.find(p => p.id === productId);
    if (!product) return;

    try {
      if (existing && existing.id) {
        // Cập nhật cả số lượng và giá mới nhất từ thực đơn khi cộng dồn
        await handleUpdateOrderItem(existingIndex, {
          quantity: (existing.quantity || 0) + quantity,
          price: product.price
        });
      } else {
        processingAddRef.current.add(productId);
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomSessionId: session.id, productId, quantity }),
        });
        if (res.ok) {
          const newItem = await res.json();
          setOrderItems(prev => {
            const updated = [...prev, newItem];
            setLastAddedIndex(updated.length - 1);
            return updated;
          });
        }
      }
    } catch (err) { console.error('Error adding product:', err); toast.error('Lỗi khi thêm sản phẩm'); }
    finally { processingAddRef.current.delete(productId); }
  };

  const handleSearchEnter = () => {
    if (!searchTerm.trim()) return;
    if (!session) {
      toast.error('Vui lòng mở phòng để bắt đầu order');
      return;
    }

    const trimmed = searchTerm.trim().toLowerCase();
    const searchNorm = removeAccents(trimmed);

    // Tìm khớp chính xác trước
    let product = products.find(p => p.name.toLowerCase() === trimmed);

    // Nếu không khớp chính xác, tìm khớp không dấu
    if (!product) {
      product = products.find(p => removeAccents(p.name.toLowerCase()) === searchNorm);
    }

    // Nếu không có khớp chính xác, tìm sản phẩm chứa text từ gợi ý
    if (!product && productSuggestions.length > 0) {
      product = productSuggestions[0];
    }

    if (product) {
      handleAddProduct(product.id, 1);
      setShowProductSuggestions(false);
      setSearchTerm('');
    } else {
      toast.error('Không tìm thấy sản phẩm');
    }
  };

  const handleOpenAddProduct = () => {
    setNewProductForm({
      id: '',
      name: searchTerm,
      category: 'food',
      price: '',
      quantity: '0'
    });
    setIsAddProductModalOpen(true);
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!room || !newProductForm.name || !newProductForm.price) return;

    const sId = room.storeId ?? (room as any).StoreId;
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: sId,
          name: newProductForm.name,
          category: newProductForm.category as any,
          price: parseFloat(newProductForm.price),
          quantity: parseInt(newProductForm.quantity) || 0,
          logNote: `Thêm nhanh từ phòng ${room.roomNumber}`,
        }),
      });

      if (res.ok) {
        const newProduct = await res.json();
        setProducts(prev => [...prev, newProduct]);
        setIsAddProductModalOpen(false);
        setNewProductForm({ id: '', name: '', category: 'food', price: '', quantity: '0' });
        toast.success('Đã thêm sản phẩm mới vào danh mục');
      } else {
        const error = await res.json();
        toast.error(error.error || 'Lỗi khi thêm sản phẩm');
      }
    } catch (err) {
      console.error('Error creating product:', err);
      toast.error('Lỗi kết nối máy chủ');
    }
  };

  const handleUpdateOrderItem = async (index: number, updates: Partial<OrderItem>) => {
    const currentOrders = orderItemsRef.current;
    const item = currentOrders[index];
    if (!item) return;
    if (updates.quantity !== undefined && updates.quantity < 1) { await handleRemoveItem(index); return; }
    try {
      const res = await fetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, ...updates }),
      });
      if (res.ok) {
        const updated = await res.json();
        setOrderItems(prev => prev.map((i) => (i.id === updated.id ? updated : i)));
        setEditingQuantities((prev) => { const n = { ...prev }; delete n[index]; return n; });
        setEditingPrices((prev) => { const n = { ...prev }; delete n[index]; return n; });
        setEditingNames((prev) => { const n = { ...prev }; delete n[index]; return n; });
      } else toast.error('Lỗi khi cập nhật số lượng');
    } catch (err) { console.error('Error updating quantity:', err); toast.error('Lỗi khi cập nhật số lượng'); }
  };

  const handleQuantityChange = (index: number, value: string) =>
    setEditingQuantities((prev) => ({ ...prev, [index]: value }));

  const handlePriceChange = (index: number, value: string) => {
    const numericValue = value.replace(/\D/g, '');
    const formattedValue = numericValue ? parseInt(numericValue).toLocaleString('vi-VN') : '';
    setEditingPrices((prev) => ({ ...prev, [index]: formattedValue }));
  };

  const handlePriceBlur = (index: number) => {
    const val = editingPrices[index];
    if (val === undefined || val === '') {
      setEditingPrices((prev) => { const n = { ...prev }; delete n[index]; return n; });
      return;
    }
    const price = parseInt(val.replace(/\D/g, ''));
    const item = orderItems[index];
    if (!isNaN(price) && price >= 0 && item && item.price !== price) {
      handleUpdateOrderItem(index, { price });
    } else {
      setEditingPrices((prev) => { const n = { ...prev }; delete n[index]; return n; });
    }
  };

  const handleNameChange = (index: number, value: string) =>
    setEditingNames((prev) => ({ ...prev, [index]: value }));

  const handleNameBlur = (index: number) => {
    const val = editingNames[index];
    if (val === undefined || val.trim() === '') {
      setEditingNames((prev) => { const n = { ...prev }; delete n[index]; return n; });
      return;
    }
    const item = orderItems[index];
    if (item && item.productName !== val) {
      handleUpdateOrderItem(index, { productName: val });
    } else {
      setEditingNames((prev) => { const n = { ...prev }; delete n[index]; return n; });
    }
  };

  const handleNoteChange = (productId: string, value: string) => {
    setLocalItemNotes(prev => ({ ...prev, [productId]: value }));
    if (!value) {
      const newNotes = { ...localItemNotes };
      delete newNotes[productId];
      setLocalItemNotes(newNotes);
    }
  };

  const handleQuantityBlur = (index: number) => {
    const value = editingQuantities[index];
    if (value === undefined || value === '') {
      setEditingQuantities((prev) => { const n = { ...prev }; delete n[index]; return n; }); return;
    }
    const qty = parseInt(value);
    const item = orderItems[index];
    if (!isNaN(qty) && qty >= 0 && item && item.quantity !== qty) {
      handleUpdateOrderItem(index, { quantity: qty, price: item.price });
    }
    else setEditingQuantities((prev) => { const n = { ...prev }; delete n[index]; return n; });
  };

  const handleRemoveItem = async (index: number) => {
    const item = orderItems[index];
    if (!item) return;
    try {
      await fetch('/api/orders', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      });
      setOrderItems((prev) => prev.filter((i) => i.id !== item.id));
      setEditingQuantities((prev) => { const n = { ...prev }; delete n[index]; return n; });
    } catch (err) { console.error('Error removing item:', err); toast.error('Lỗi khi xóa sản phẩm'); }
  };

  const handleApplyVoucher = () => {
    if (voucherCode.trim().toUpperCase() === VOUCHER_VALID) {
      setVoucherApplied(true);
      toast.success('Áp dụng voucher thành công! Giảm 10%');
    } else {
      setVoucherApplied(false);
      toast.error('Mã voucher không hợp lệ');
    }
  };

  const handleRemoveVoucher = () => {
    setVoucherApplied(false);
    setVoucherCode('');
  };

  const handleGenerateInvoice = async () => {
    if (!session || !room || timeError || (durationMinutes === 0 && orderItems.length === 0)) return;
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomSessionId: String(session.id ?? (session as any).Id),
          roomId: String(room.id ?? (room as any).Id),
          storeId: String(room.storeId ?? (room as any).StoreId),
          startTime: new Date(selectedStartTime).toISOString(),
          endTime: new Date(selectedEndTime).toISOString(),
          roomCost: Math.round(roomChargeTotal),
          totalPrice: finalTotal,
          customerName: customerName.trim() || 'Khách lẻ',
          // Gửi kèm ghi chú local lên để API hóa đơn tự gán vào InvoiceItem
          itemNotes: localItemNotes
        }),
      });
      if (res.ok) {
        const sessionId = session.id ?? (session as any).Id;
        localStorage.removeItem(`notes_${sessionId}`); // Xóa nháp sau khi đã thanh toán
        localStorage.removeItem(`voucher_${sessionId}`); // Xóa voucher sau khi đã thanh toán
        const result = await res.json();
        const invoiceData = result.data || result;
        toast.success('Tạo hóa đơn thành công');
        router.push(`/dashboard/invoice/${invoiceData.id ?? invoiceData.Id}?print=true`);
      } else toast.error('Lỗi khi tạo hóa đơn');
    } catch (err) { console.error('Error generating invoice:', err); toast.error('Lỗi khi tạo hóa đơn'); }
  };

  // ── Computed ───────────────────────────────────────────────────────────────

  const { roomCharge, durationMinutes, durationText, timeError } = useMemo(() => {
    const start = rawStartTime;
    const end = rawEndTime;
    const s = session as any;
    const isPending = !s || s.status === 'pending' || s.Status === 'pending';

    const validStart = start && !isNaN(start.getTime());
    const validEnd = end && !isNaN(end.getTime());
    if (!validStart || !validEnd)
      return { roomCharge: 0, durationMinutes: 0, durationText: 'Chọn giờ bắt đầu và kết thúc', timeError: 'Vui lòng chọn cả giờ bắt đầu và giờ kết thúc' };
    if (end <= start || isPending)
      return { roomCharge: 0, durationMinutes: 0, durationText: isPending ? 'Chờ khách vào' : 'Giờ kết thúc phải lớn hơn giờ bắt đầu', timeError: isPending ? '' : 'Giờ kết thúc phải lớn hơn giờ bắt đầu' };
    const minutes = Math.ceil((end.getTime() - start.getTime()) / 60000);
    const cost = room ? Math.ceil((minutes * customPricePerHour) / 60) : 0;
    const h = Math.floor(minutes / 60), m = minutes % 60;
    return { roomCharge: cost, durationMinutes: minutes, durationText: h > 0 ? `${h} giờ ${m > 0 ? `${m} phút` : ''}`.trim() : `${m} phút`, timeError: '' };
  }, [rawStartTime, rawEndTime, room, customPricePerHour, session]);

  const desktopFiltered = useMemo(() => {
    const search = removeAccents(searchTerm.toLowerCase());
    return stableSortedProducts.filter((p) =>
      removeAccents(p.name.toLowerCase()).includes(search) &&
      (activeCategory === 'all' || p.category === activeCategory)
    );
  }, [stableSortedProducts, searchTerm, activeCategory]);

  const mobileFiltered = useMemo(() => {
    const search = removeAccents(searchTerm.toLowerCase());
    return [...stableSortedProducts].reverse().filter((p) =>
      removeAccents(p.name.toLowerCase()).includes(search) &&
      (mobileCat === 'all' || p.category === mobileCat)
    );
  }, [stableSortedProducts, searchTerm, mobileCat]);

  const totalProductCost = orderItems.reduce((s, i) => s + (Number(i.price || 0) * Number(i.quantity || 0)), 0);
  const roomChargeTotal = roomCharge;
  const total = roomChargeTotal + totalProductCost;
  const discountAmount = voucherApplied ? Math.round(total * VOUCHER_DISCOUNT) : 0;
  const finalTotal = Math.ceil((total - discountAmount) / 1000) * 1000;
  const totalItems = orderItems.reduce((s, i) => s + i.quantity, 0);

  // ── Loading / Not found ────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-4 border-slate-200 border-t-indigo-600 animate-spin" />
          </div>
          <p className="text-slate-500 font-medium animate-pulse">Đang tải dữ liệu phòng...</p>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="bg-white border-none shadow-2xl p-10 text-center max-w-sm rounded-3xl">
          <p className="text-slate-600 mb-4">Không tìm thấy phòng</p>
          <Link href="/dashboard"><Button className="w-full bg-slate-900 hover:bg-slate-800 rounded-xl">Quay lại trang chủ</Button></Link>
        </Card>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // MOBILE UI  (< 1024px)
  // ════════════════════════════════════════════════════════════════════════════

  if (isMobile) {
    return (
      <>
        <div className="flex flex-col h-dvh bg-slate-50 overflow-hidden font-sans">
          <style jsx global>{`
          .no-scrollbar::-webkit-scrollbar { display: none; }
          .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        `}</style>

          {/* Header */}
          <div className="bg-white/90 backdrop-blur border-b px-4 py-3 flex items-center justify-between shadow-sm sticky top-0 z-20">
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-1 text-slate-500 active:scale-95 transition"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-center">
              <div className="text-base font-bold text-slate-900">
                Phòng {room.roomNumber}
              </div>
              <div className={`flex items-center justify-center gap-1 text-xs font-medium mt-0.5
      ${session ? 'text-emerald-500' : 'text-red-500'}
    `}>
                <span className={`w-2 h-2 rounded-full
        ${session ? 'bg-emerald-500' : 'bg-red-500'}
      `} />
                {session ? 'Đang hoạt động' : 'Phòng trống'}
              </div>
            </div>
            {session ? (
              <button
                onClick={handleCancelSession}
                className="text-xs font-semibold bg-rose-100 text-rose-600 px-3 py-1.5 rounded-full active:scale-95 transition">
                Hủy
              </button>
            ) : (
              <div className="w-12" />
            )}
          </div>

          {!session ? (
            <div className="flex-1 flex flex-col items-center justify-center px-6 bg-slate-50 p-3">
              <h2 className="text-xl font-bold text-slate-900 mb-1 text-center">
                Sẵn sàng phục vụ
              </h2>
              <p className="text-slate-500 text-sm text-center mb-8 leading-relaxed max-w-xs">
                Phòng hiện đang trống. Bạn có thể mở phòng để order đồ trước.
              </p>
              <button
                onClick={handleStartSession}
                className="w-full max-w-xs bg-indigo-600 text-white rounded-xl py-4 text-base font-semibold shadow-lg active:scale-95 transition flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Mở phòng / Order trước
              </button>
            </div>
          ) : (
            <>
              {/* ── 2 Tabs: Giỏ hàng | Thực đơn ── */}
              <div className="bg-white px-3 py-2 border-b shadow-sm sticky top-0 z-10">
                <div className="flex bg-slate-100 rounded-2xl p-1">
                  {([
                    { id: 'cart', label: `Giỏ hàng${orderItems.length > 0 ? ` (${orderItems.length})` : ''}`, icon: <ShoppingCart className="w-5 h-5" /> },
                    { id: 'menu', label: 'Thực đơn', icon: <Grid className="w-5 h-5" /> },
                  ] as const).map(tab => {
                    const active = mobileTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setMobileTab(tab.id)}
                        className={`flex-1 flex flex-col items-center justify-center py-2 rounded-xl transition-all duration-200
            ${active ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
                      >
                        <div className={`mb-0.5 ${active ? 'scale-110' : ''}`}>{tab.icon}</div>
                        <span className="text-[11px] font-semibold">{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex-1 overflow-hidden flex flex-col">

                {/* ══════════════════════════════════════════
                    Tab: Menu
                ══════════════════════════════════════════ */}
                {mobileTab === 'menu' && (
                  <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">

                    {/* ── Search ── */}
                    <div className="px-3 py-2.5 bg-white border-b border-slate-100">
                      <div className="relative">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        <input
                          type="text"
                          placeholder="Tìm món..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-full bg-slate-100 rounded-xl pl-10 pr-9 py-2.5 text-base font-medium text-slate-800 placeholder-slate-400 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-200 transition"
                        />
                        {searchTerm && (
                          <button
                            onClick={() => setSearchTerm('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-slate-300 active:scale-90 transition"
                          >
                            <X className="w-3 h-3 text-white" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* ── Categories ── */}
                    <div className="px-3 py-2 flex gap-2 items-center overflow-x-auto no-scrollbar bg-white border-b border-slate-100">
                      <button
                        onClick={handleOpenAddProduct}
                        className="shrink-0 flex items-center gap-1 h-8 px-3 bg-indigo-600 text-white rounded-xl text-xs font-bold active:scale-95 transition whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Thêm
                      </button>
                      <div className="w-px h-5 bg-slate-200 shrink-0" />
                      {MOBILE_CATEGORIES.map(cat => (
                        <button
                          key={cat.id}
                          onClick={() => setMobileCat(cat.id)}
                          className={`flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-semibold whitespace-nowrap transition active:scale-95
            ${mobileCat === cat.id
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            }`}
                        >
                          {cat.icon}
                          {cat.name}
                        </button>
                      ))}
                    </div>

                    {/* ── Product Grid ── */}
                    <div className="flex-1 overflow-y-auto p-3">
                      {mobileFiltered.length === 0 ? (
                        <div className="py-16 flex flex-col items-center text-slate-400">
                          <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center mb-3 shadow-sm">
                            <Search className="w-6 h-6 opacity-30" />
                          </div>
                          <p className="text-sm font-semibold text-slate-500 mb-1">Không tìm thấy món</p>
                          {searchTerm && (
                            <button
                              onClick={handleOpenAddProduct}
                              className="mt-4 flex items-center gap-2 bg-indigo-600 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-100 active:scale-95 transition"
                            >
                              <Plus className="w-3.5 h-3.5" /> Thêm "{searchTerm}"
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2.5">
                          {mobileFiltered.map(product => {
                            const inCart = orderItems.find(i => i.productId === product.id)?.quantity || 0;
                            const available = product.quantity - inCart;
                            const unavail = available <= 0;
                            const lowStock = available > 0 && available <= 5;

                            return (
                              <div
                                key={product.id}
                                onClick={(e) => {
                                  if ((e.target as HTMLElement).closest('button')) return;
                                  !unavail && handleOpenOrderQuantityModal(product);
                                }}
                                className={`bg-white rounded-2xl p-3 flex flex-col justify-between relative overflow-hidden transition
                  ${unavail ? 'opacity-40' : 'active:scale-[0.98] cursor-pointer'}
                  ${inCart > 0 ? 'ring-2 ring-indigo-400 ring-offset-1' : 'shadow-sm'}`}
                              >
                                {/* Số lượng trong giỏ — luôn hiển thị */}
                                <div className="absolute top-2 right-2">
                                  <div className={`w-6 h-6 text-[11px] font-black rounded-full flex items-center justify-center transition-all
                    ${inCart > 0
                                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200 scale-110'
                                      : 'bg-slate-100 text-slate-300'
                                    }`}>
                                    {inCart}
                                  </div>
                                </div>

                                {/* Name & price */}
                                <div className="mb-3 pr-7">
                                  <div className="font-semibold text-slate-800 text-sm line-clamp-2 leading-snug">
                                    {product.name}
                                  </div>
                                  <div className="text-indigo-600 font-black text-sm mt-1">
                                    {product.price.toLocaleString('vi-VN')}đ
                                  </div>
                                </div>

                                {/* Footer */}
                                <div className="flex items-center justify-between">
                                  <span className={`text-[10px] font-bold px-2 py-1 rounded-lg
                    ${unavail
                                      ? 'bg-red-50 text-red-400'
                                      : lowStock
                                        ? 'bg-amber-50 text-amber-500'
                                        : 'bg-emerald-50 text-emerald-600'
                                    }`}>
                                    {unavail ? 'Hết' : `${available} còn`}
                                  </span>

                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleOpenEditProduct(product); }}
                                      className="w-9 h-9 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center active:scale-90 transition touch-manipulation"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    {!unavail && (
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleAddProduct(product.id, 1); }}
                                        className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center active:scale-95 transition touch-manipulation"
                                      >
                                        <Plus className="w-4 h-4 text-white" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ══════════════════════════════════════════
                    Tab: Giỏ hàng  — bao gồm tiền giờ & thanh toán
                ══════════════════════════════════════════ */}
                {mobileTab === 'cart' && (
                  <div className="flex-1 flex flex-col bg-slate-50 overflow-y-auto">
                    <div className="flex-1">

                      {/* ── BLOCK 1: Tiền giờ (luôn hiển thị đầu tiên) ── */}
                      <div className="mx-4 mt-4 bg-white rounded-2xl shadow-sm overflow-hidden">
                        {/* Tiêu đề row */}
                        <div className="flex items-center justify-between px-4 pt-4 pb-2">
                          <div className="flex items-center gap-2 text-indigo-600">
                            <Clock className="w-4 h-4" />
                            <span className="font-bold text-xs uppercase tracking-wider">Tiền giờ</span>
                          </div>
                          <button
                            onClick={openTransferModal}
                            className="p-1.5 text-indigo-600 bg-indigo-50 rounded-lg active:scale-90 transition-transform border border-indigo-100"
                            title="Chuyển phòng"
                          >
                            <ArrowRightLeft className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="px-4 pb-4 space-y-3">
                          {/* Giờ vào */}
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Giờ vào</label>
                            <div className="flex gap-2">
                              <input
                                type="datetime-local"
                                value={selectedStartTime}
                                onChange={(e) => handleStartTimeChange(e.target.value)}
                                className="flex-1 bg-slate-100 rounded-xl px-3 py-2.5 text-base font-semibold outline-none focus:ring-2 focus:ring-indigo-200"
                              />
                              <button
                                onClick={handleUpdateStartTime}
                                className="bg-indigo-100 text-indigo-600 px-3 rounded-xl text-xs font-bold active:scale-95 transition whitespace-nowrap"
                              >
                                {((session as any)?.status === 'active' || (session as any)?.Status === 'active') ? 'XÓA' : 'BẮT ĐẦU'}
                              </button>
                            </div>
                          </div>

                          {/* Giờ ra */}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase">Giờ ra (dự kiến)</label>
                              <div className={`text-[9px] font-black px-2 py-0.5 rounded-lg transition-colors ${isManualEndTime ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                {isManualEndTime ? 'CHỈNH TAY' : 'THEO MÁY'}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <input
                                type="datetime-local"
                                value={selectedEndTime}
                                onChange={(e) => handleEndTimeChange(e.target.value)}
                                className={`flex-1 min-w-0 bg-slate-100 rounded-xl px-3 py-2.5 text-base font-semibold outline-none focus:ring-2 focus:ring-indigo-200 transition-all ${isManualEndTime ? 'border-2 border-indigo-400 bg-white' : ''}`}
                              />
                              {isManualEndTime && (
                                <button
                                  onClick={handleResetManualEndTime}
                                  className="bg-indigo-600 text-white px-3 rounded-xl text-[10px] font-black uppercase active:scale-95 transition-all shadow-sm shadow-indigo-100"
                                >
                                  Đặt lại
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Giá giờ & Khách */}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Giá giờ</label>
                              <input
                                type="text"
                                value={customPricePerHour.toLocaleString('vi-VN')}
                                onChange={(e) => {
                                  const val = e.target.value.replace(/\D/g, '');
                                  setCustomPricePerHour(val ? parseInt(val) : 0);
                                }}
                                onBlur={(e) => debouncedSyncRoomPrice(parseInt(e.target.value.replace(/\D/g, '')) || 0)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    (e.target as HTMLInputElement).blur();
                                  }
                                }}
                                className="w-full bg-slate-100 rounded-xl px-3 py-2.5 text-base font-black text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-200"
                              />
                            </div>
                            <div className="relative">
                              <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Khách hàng</label>
                              <input
                                type="text"
                                placeholder="Tên / SĐT..."
                                value={customerName}
                                onChange={(e) => {
                                  setCustomerName(e.target.value);
                                  setShowSuggestions(true);
                                  debouncedSyncCustomerName(e.target.value); // Truyền giá trị vào đây
                                }}
                                onFocus={() => setShowSuggestions(true)}
                                onBlur={() => {
                                  // Đảm bảo sync lần cuối khi rời ô nhập nếu debounce chưa kịp chạy
                                  syncCustomerName(customerName);
                                  setTimeout(() => setShowSuggestions(false), 200);
                                }}
                                className="w-full bg-slate-100 rounded-xl px-3 py-2.5 text-base font-semibold placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-200"
                              />
                              {showSuggestions && customerSuggestions.length > 0 && (
                                <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-2xl mt-1 shadow-2xl max-h-48 overflow-auto py-1 ring-1 ring-black/5">
                                  {customerSuggestions.map((name) => (
                                    <li
                                      key={name}
                                      onClick={() => { setCustomerName(name); setShowSuggestions(false); syncCustomerName(name); }} // Sync NGAY LẬP TỨC khi click
                                      className="px-4 py-3 text-sm font-bold text-slate-700 hover:bg-indigo-50 border-b border-slate-50 last:border-0 cursor-pointer flex items-center gap-2"
                                    >
                                      <Users className="w-3 h-3 text-slate-400" /> {name}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>

                          {/* Tiền giờ hiển thị */}
                          <div className="flex items-center justify-between bg-indigo-50 rounded-xl px-4 py-3">
                            <span className="text-xs font-bold text-indigo-500 uppercase tracking-wider">
                              {durationText}
                            </span>
                            <span className="text-lg font-black text-indigo-700">
                              {roomChargeTotal.toLocaleString('vi-VN')}đ
                            </span>
                          </div>

                          {timeError && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
                              <Info className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                              <p className="text-amber-700 text-xs font-medium">{timeError}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ── BLOCK 2: Danh sách món ── */}
                      <div className="mx-4 mt-4 space-y-0">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 text-slate-600">
                            <ShoppingCart className="w-4 h-4" />
                            <span className="font-bold text-xs uppercase tracking-wider">Dịch vụ ({orderItems.length} món)</span>
                          </div>
                          <button
                            onClick={() => setMobileTab('menu')}
                            className="text-indigo-600 text-xs font-bold bg-indigo-50 px-3 py-1.5 rounded-full active:scale-95 transition flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> Thêm
                          </button>
                        </div>

                        {orderItems.length === 0 ? (
                          <div className="bg-white rounded-2xl py-10 text-center shadow-sm">
                            <ShoppingCart className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                            <p className="text-slate-400 text-xs font-semibold">Chưa gọi món nào</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {[...orderItems].reverse().map((item, i) => {
                              const index = orderItems.length - 1 - i;
                              return (
                                <div
                                  key={item.id ?? index}
                                  ref={(el) => {
                                    itemRefs.current[index] = el;
                                    if (index === orderItems.length - 1) (lastItemRef as any).current = el;
                                  }}
                                  className="bg-white rounded-2xl px-3 py-3 shadow-sm flex items-center gap-2"
                                >
                                  <div className="w-5 h-5 flex items-center justify-center bg-slate-50 rounded-lg text-[10px] font-black text-slate-400 shrink-0">
                                    {index + 1}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-slate-900 text-sm leading-snug line-clamp-2">
                                      {item.productName}
                                    </div>
                                    <input
                                      type="text"
                                      placeholder="Thêm ghi chú..."
                                      className="text-[10px] text-slate-400 bg-transparent border-none outline-none focus:text-indigo-600 w-full p-0 mt-0.5 italic"
                                      value={localItemNotes[item.productId] || ''}
                                      onChange={(e) => handleNoteChange(item.productId, e.target.value)}
                                    />
                                    <div className="text-indigo-500 text-sm mt-0.5 font-medium">
                                      {item.price.toLocaleString('vi-VN')}đ
                                    </div>
                                    <div className="text-[10px] font-bold text-slate-400">
                                      Tổng: {(item.price * item.quantity).toLocaleString('vi-VN')}đ
                                    </div>
                                  </div>
                                  <div className="flex items-center bg-slate-100 rounded-xl px-1 py-1 gap-1">
                                    <button
                                      onClick={() => {
                                        handleUpdateOrderItem(index, { quantity: item.quantity - 1, price: item.price });
                                      }}
                                      className="w-7 h-7 bg-white rounded-lg flex items-center justify-center shadow text-slate-500 active:scale-90"
                                    >
                                      <Minus className="w-3 h-3" />
                                    </button>
                                    <div
                                      onClick={() => {
                                        const p = products.find(prod => prod.id === item.productId);
                                        if (p) handleOpenOrderQuantityModal(p);
                                      }}
                                      className="w-8 h-7 flex items-center justify-center font-bold text-slate-900 text-base cursor-pointer active:bg-white rounded-lg transition-colors touch-manipulation"
                                    >
                                      {item.quantity}
                                    </div>
                                    <button
                                      onClick={() => {
                                        handleUpdateOrderItem(index, { quantity: item.quantity + 1, price: item.price });
                                      }}
                                      className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center text-white active:scale-90"
                                    >
                                      <Plus className="w-3 h-3" />
                                    </button>
                                  </div>
                                  <button
                                    onClick={() => handleRemoveItem(index)}
                                    className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-red-500 active:scale-90"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Voucher */}
                    <div className="mx-4 mt-3">
                      {!voucherApplied ? (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Nhập mã voucher..."
                            value={voucherCode}
                            onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                            onKeyDown={(e) => e.key === 'Enter' && handleApplyVoucher()}
                            className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-200 uppercase"
                          />
                          <button
                            onClick={handleApplyVoucher}
                            className="bg-indigo-600 text-white px-4 rounded-xl text-xs font-bold active:scale-95 transition whitespace-nowrap"
                          >
                            Áp dụng
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            <span className="text-xs font-bold text-emerald-700">Voucher <span className="uppercase">{voucherCode}</span> (-10%)</span>
                          </div>
                          <button onClick={handleRemoveVoucher} className="text-slate-400 active:scale-90">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Tổng */}
                    <div className="mx-4 mt-3 bg-indigo-600 rounded-2xl p-4 shadow-lg">
                      <div className="flex justify-between items-center text-sm text-indigo-200 mb-1">
                        <span>Tiền phòng</span>
                        <span className="font-semibold text-white">{roomChargeTotal.toLocaleString('vi-VN')}đ</span>
                      </div>
                      <div className="flex justify-between items-center text-sm text-indigo-200 mb-1">
                        <span>Dịch vụ</span>
                        <span className="font-semibold text-white">{totalProductCost.toLocaleString('vi-VN')}đ</span>
                      </div>
                      {voucherApplied && (
                        <div className="flex justify-between items-center text-sm text-emerald-300 mb-1">
                          <span>Giảm giá (10%)</span>
                          <span className="font-semibold">-{discountAmount.toLocaleString('vi-VN')}đ</span>
                        </div>
                      )}
                      <div className="border-t border-indigo-500 pt-3 flex justify-between items-center">
                        <span className="text-xs font-black text-indigo-300 uppercase tracking-widest">Tổng cộng</span>
                        <span className="text-2xl font-black text-white">{finalTotal.toLocaleString('vi-VN')}đ</span>
                      </div>
                    </div>

                    {/* ── BLOCK 4: Nút hành động ── */}
                    <div className="mx-4 mt-4 mb-8 grid grid-cols-2 gap-3">
                      {(session?.status === 'paused' || (session as any)?.Status === 'paused') ? (
                        <>
                          <button
                            onClick={handleResumeSession}
                            className="bg-emerald-600 text-white rounded-2xl py-4 flex flex-col items-center justify-center gap-1.5 shadow-lg active:scale-95 transition-all"
                          >
                            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                              <ChevronRight className="w-5 h-5" />
                            </div>
                            <span className="text-[11px] font-black uppercase tracking-wider">Tiếp tục</span>
                          </button>
                          <button
                            onClick={() => window.print()}
                            className="bg-white border border-slate-200 text-slate-600 rounded-2xl py-4 flex flex-col items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
                          >
                            <div className="w-9 h-9 bg-slate-50 rounded-xl flex items-center justify-center">
                              <ReceiptText className="w-5 h-5 text-slate-500" />
                            </div>
                            <span className="text-[11px] font-black uppercase tracking-wider">In phiếu</span>
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={handlePauseSession}
                          className="bg-amber-100 text-amber-600 rounded-2xl py-4 flex flex-col items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
                        >
                          <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center">
                            <Clock className="w-5 h-5" />
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-wider">Tạm tính</span>
                        </button>
                      )}

                      <button
                        onClick={handleGenerateInvoice}
                        disabled={!!timeError || (durationMinutes === 0 && orderItems.length === 0)}
                        className="bg-indigo-600 text-white rounded-2xl py-4 flex flex-col items-center justify-center gap-1.5 shadow-lg shadow-indigo-200 active:scale-95 transition-all disabled:opacity-40"
                      >
                        <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                          <CheckCircle2 className="w-5 h-5" />
                        </div>
                        <span className="text-[11px] font-black uppercase tracking-wider">Thanh toán</span>
                      </button>
                    </div>
                  </div>
                )}

              </div>
            </>
          )}
        </div>

        {/* ── Transfer Room Modal (Mobile) ── */}
        <Dialog open={isTransferModalOpen} onOpenChange={setIsTransferModalOpen}>
          <DialogContent className="max-w-[90vw] w-full rounded-4xl p-6">
            <DialogHeader>
              <DialogTitle className="text-xl font-black uppercase tracking-tight text-indigo-600">Chọn phòng chuyển đến</DialogTitle>
              <DialogDescription className="font-medium text-xs">
                Chuyển toàn bộ dịch vụ từ phòng {room.roomNumber} sang một phòng trống khác.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 mt-4 overflow-y-auto max-h-[50vh] p-1">
              {availableRooms.length > 0 ? (
                availableRooms.map((r) => (
                  <Button
                    key={r.id} variant="outline"
                    className="h-20 flex flex-col font-bold border-2 hover:border-indigo-500 hover:text-indigo-600 rounded-2xl transition-all"
                    onClick={() => { setIsTransferModalOpen(false); handleTransferRoom(r.id); }}
                  >
                    <span className="text-lg">P. {r.roomNumber}</span>
                    <span className="text-[10px] text-slate-400 font-normal">Sức chứa: {r.capacity}</span>
                  </Button>
                ))
              ) : (
                <p className="col-span-2 text-center py-8 text-slate-500 italic text-sm">Không có phòng nào đang trống</p>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Order Quantity Modal (Mobile) ── */}
        <Dialog open={isOrderQuantityModalOpen} onOpenChange={setIsOrderQuantityModalOpen}>
          <DialogContent className="max-w-[90vw] w-full rounded-4xl p-6 z-200">
            <DialogHeader>
              <DialogTitle className="text-xl font-black uppercase tracking-tight text-indigo-600">
                Gọi món: {selectedProductForOrder?.name}
              </DialogTitle>
              <DialogDescription className="font-bold text-[10px] text-slate-400 uppercase">
                Tồn kho: {selectedProductForOrder?.quantity} |
                Đang chọn: {orderItems.find(i => i.productId === selectedProductForOrder?.id)?.quantity || 0}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleConfirmOrderQuantity} className="space-y-4 mt-2">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Số lượng muốn đặt</label>
                <Input
                  required
                  type="number"
                  value={orderQuantityInput}
                  onChange={e => setOrderQuantityInput(e.target.value)}
                  className="rounded-xl h-14 text-center text-2xl font-black text-indigo-600"
                  onFocus={(e) => e.target.select()}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <Button type="submit" className="flex-1 bg-indigo-600 h-14 rounded-xl font-bold">Thêm vào đơn</Button>
                <Button type="button" variant="ghost" onClick={() => setIsOrderQuantityModalOpen(false)} className="h-14 rounded-xl">Hủy</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* ── Quick Add Product Modal (Mobile) ── */}
        <Dialog open={isAddProductModalOpen} onOpenChange={setIsAddProductModalOpen}>
          <DialogContent className="max-w-[90vw] w-full rounded-4xl p-6">
            <DialogHeader>
              <DialogTitle className="text-xl font-black uppercase tracking-tight text-indigo-600">Thêm sản phẩm mới</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateProduct} className="space-y-4 mt-2">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Tên sản phẩm</label>
                <Input required value={newProductForm.name} onChange={e => setNewProductForm({ ...newProductForm, name: e.target.value })} placeholder="VD: Pepsi..." className="rounded-xl h-11" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Loại</label>
                  <Select value={newProductForm.category} onValueChange={(val) => setNewProductForm({ ...newProductForm, category: val as any })}>
                    <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-white text-sm"><SelectValue placeholder="Chọn loại" /></SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      <SelectItem value="food">Đồ ăn</SelectItem>
                      <SelectItem value="drink">Đồ uống</SelectItem>
                      <SelectItem value="dry">Đồ khô</SelectItem>
                      <SelectItem value="fruit">Trái cây</SelectItem>
                      <SelectItem value="other">Khác</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Giá bán</label>
                  <Input required type="text"
                    value={newProductForm.price ? Number(newProductForm.price).toLocaleString('vi-VN') : ''}
                    onChange={e => { const val = e.target.value.replace(/\D/g, ''); setNewProductForm({ ...newProductForm, price: val }); }}
                    placeholder="0" className="rounded-xl h-11" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Số lượng nhập kho</label>
                <Input type="number" value={newProductForm.quantity} onChange={e => setNewProductForm({ ...newProductForm, quantity: e.target.value })} className="rounded-xl h-11" />
              </div>
              <div className="flex gap-3 pt-4">
                <Button type="submit" className="flex-1 bg-indigo-600 h-12 rounded-xl font-bold">Lưu & Thêm</Button>
                <Button type="button" variant="ghost" onClick={() => setIsAddProductModalOpen(false)} className="h-12 rounded-xl">Hủy</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* ── Quick Edit Product Modal (Mobile) ── */}
        <Dialog open={isEditProductModalOpen} onOpenChange={setIsEditProductModalOpen}>
          <DialogContent className="max-w-[90vw] w-full rounded-4xl p-6 z-150">
            <DialogHeader>
              <DialogTitle className="text-xl font-black uppercase tracking-tight text-indigo-600">Sửa thông tin sản phẩm</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleUpdateProductFromMenu} className="space-y-4 mt-2">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Tên sản phẩm</label>
                <Input required value={newProductForm.name} onChange={e => setNewProductForm({ ...newProductForm, name: e.target.value })} className="rounded-xl h-11" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Loại</label>
                  <Select value={newProductForm.category} onValueChange={(val) => setNewProductForm({ ...newProductForm, category: val as any })}>
                    <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-white text-sm"><SelectValue placeholder="Chọn loại" /></SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      <SelectItem value="food">Đồ ăn</SelectItem>
                      <SelectItem value="drink">Đồ uống</SelectItem>
                      <SelectItem value="dry">Đồ khô</SelectItem>
                      <SelectItem value="fruit">Trái cây</SelectItem>
                      <SelectItem value="other">Khác</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Giá bán</label>
                  <Input required type="text"
                    value={newProductForm.price ? Number(newProductForm.price).toLocaleString('vi-VN') : ''}
                    onChange={e => { const val = e.target.value.replace(/\D/g, ''); setNewProductForm({ ...newProductForm, price: val }); }}
                    className="rounded-xl h-11 font-bold text-indigo-600" />
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Số lượng kho (Hiện có)</label>
                  <Input type="number" value={newProductForm.quantity} onChange={e => setNewProductForm({ ...newProductForm, quantity: e.target.value })} className="rounded-xl h-11 font-bold" />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <Button type="submit" className="flex-1 bg-indigo-600 h-12 rounded-xl font-bold text-sm">Cập nhật</Button>
                <Button type="button" variant="ghost" onClick={() => setIsEditProductModalOpen(false)} className="h-12 rounded-xl text-sm">Hủy</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // DESKTOP UI  (>= 1024px) — không thay đổi
  // ════════════════════════════════════════════════════════════════════════════

  return (
    <>
      <div className="min-h-screen lg:h-screen flex flex-col bg-[#F8FAFC] print:hidden overflow-x-hidden">
        {/* Header */}
        {/* Header */}
        <div className="bg-white border-b border-slate-100 z-40">
          <div className="max-w-7xl mx-auto px-4 lg:px-6 py-3 grid grid-cols-3 items-center">

            {/* Left: Nút quay lại */}
            <div className="flex items-center">
              <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')}
                className="text-slate-500 hover:text-indigo-600 gap-2 font-bold px-3">
                <ChevronLeft className="w-5 h-5" />
                <span className="hidden sm:inline">Quay lại</span>
              </Button>
            </div>

            {/* Center: Tên phòng & trạng thái — căn giữa hoàn toàn */}
            <div className="flex flex-col items-center justify-center">
              <h1 className="text-lg lg:text-xl font-black text-slate-900 tracking-tight uppercase">
                P. {room.roomNumber}
              </h1>
              <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
                {room.status === 'occupied' ? 'Đang hoạt động' : 'Phòng trống'}
              </span>
            </div>

            {/* Right: Các nút hành động — căn phải */}
            <div className="flex items-center justify-end gap-2 lg:gap-3">
              {session ? (
                <>
                  <Button onClick={openTransferModal} variant="ghost"
                    className="text-indigo-600 hover:bg-indigo-50 font-bold rounded-xl px-3 lg:px-5 text-xs lg:text-sm gap-2">
                    <ArrowRightLeft className="w-4 h-4" />
                    <span className="hidden sm:inline">Chuyển phòng</span>
                  </Button>
                  <Button onClick={handleCancelSession} variant="ghost"
                    className="text-rose-500 hover:bg-rose-50 hover:text-rose-600 font-bold rounded-xl px-3 lg:px-5 text-xs lg:text-sm">
                    Hủy phòng
                  </Button>
                </>
              ) : (
                <Button onClick={handleStartSession}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 lg:px-8 rounded-xl shadow-lg shadow-indigo-200 font-bold transition-all hover:-translate-y-0.5 text-xs lg:text-sm">
                  <Plus className="w-4 h-4 mr-1 lg:hidden" />
                  <span>Mở phòng / Order trước</span>
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
          {session ? (
            <>
              {/* Left column — Cart & billing */}
              <div className="flex-1 min-w-0 bg-white border-t lg:border-t-0 lg:border-r border-slate-100 flex flex-col order-2 lg:order-2">
                <div className="p-4 lg:p-5 border-b border-slate-100">

                  {/* ── Header row: luôn hiển thị ── */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-slate-700">
                      <div className="w-7 h-7 bg-indigo-50 rounded-lg flex items-center justify-center">
                        <Clock className="w-3.5 h-3.5 text-indigo-600" />
                      </div>
                      <span className="font-black text-xs uppercase tracking-widest text-slate-600">Thời gian sử dụng</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">
                        {durationText}
                      </span>
                      <button
                        onClick={() => setShowTimeDetails(!showTimeDetails)}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all
          ${showTimeDetails ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                      >
                        <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${showTimeDetails ? 'rotate-90' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {/* ── Expandable detail ── */}
                  {showTimeDetails && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">

                      {/* Giờ vào + Ra */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block ml-0.5">
                            Giờ vào
                          </label>
                          <div className="flex gap-1.5">
                            <Input
                              type="datetime-local"
                              value={selectedStartTime}
                              onChange={(e) => handleStartTimeChange(e.target.value)}
                              className="h-9 text-[11px] bg-slate-50 border-slate-100 focus:ring-indigo-300 rounded-xl font-bold flex-1 focus:bg-white transition"
                            />
                            <Button
                              type="button" size="sm" variant="outline"
                              onClick={handleUpdateStartTime}
                              className="h-9 px-2.5 text-[10px] font-black uppercase border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300 rounded-xl shrink-0 transition"
                            >
                              {((session as any)?.status === 'active' || (session as any)?.Status === 'active') ? 'Xóa' : 'Bắt đầu'}
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block ml-0.5 flex justify-between">
                            <span>Giờ ra</span>
                            {isManualEndTime && (
                              <button
                                onClick={handleResetManualEndTime}
                                className="text-indigo-600 lowercase font-bold hover:underline"
                              >
                                (Đặt lại theo máy)
                              </button>
                            )}
                          </label>
                          <div className="relative">
                            <Input
                              type="datetime-local"
                              value={selectedEndTime}
                              onChange={(e) => handleEndTimeChange(e.target.value)}
                              className={`h-9 text-[11px] bg-slate-50 border-slate-100 focus:ring-indigo-300 rounded-xl font-bold w-full focus:bg-white transition ${isManualEndTime ? 'ring-2 ring-indigo-400' : ''}`}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Giá giờ + Tên khách */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block ml-0.5">
                            Giá / giờ
                          </label>
                          <div className="relative">
                            <Input
                              type="text"
                              value={customPricePerHour.toLocaleString('vi-VN')}
                              onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '');
                                setCustomPricePerHour(val ? parseInt(val) : 0);
                              }}
                              onBlur={(e) => syncRoomPrice(parseInt(e.target.value.replace(/\D/g, '')) || 0)}
                              className="h-9 text-xs bg-slate-50 border-slate-100 focus:ring-indigo-300 rounded-xl font-black text-indigo-600 pr-6 focus:bg-white transition"
                            />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">đ</span>
                          </div>
                        </div>

                        <div className="space-y-1 relative">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block ml-0.5">
                            Tên khách
                          </label>
                          <div className="relative">
                            <Users className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-300 pointer-events-none" />
                            <Input
                              type="text"
                              placeholder="Tên hoặc SĐT..."
                              value={customerName}
                              onChange={(e) => {
                                setCustomerName(e.target.value);
                                setShowSuggestions(true);
                                debouncedSyncCustomerName(e.target.value);
                              }}
                              onFocus={() => setShowSuggestions(true)}
                              onBlur={() => {
                                syncCustomerName(customerName);
                                setTimeout(() => setShowSuggestions(false), 200);
                              }}
                              className="h-9 text-xs bg-slate-50 border-slate-100 focus:ring-indigo-300 rounded-xl font-bold pl-7 focus:bg-white transition"
                            />
                          </div>
                          {showSuggestions && customerSuggestions.length > 0 && (
                            <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-xl mt-1 shadow-2xl max-h-40 overflow-auto py-1 ring-1 ring-black/5">
                              {customerSuggestions.map((name) => (
                                <li
                                  key={name}
                                  onClick={() => { setCustomerName(name); setShowSuggestions(false); syncCustomerName(name); }}
                                  className="px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-indigo-50 border-b border-slate-50 last:border-0 cursor-pointer flex items-center gap-2 transition-colors"
                                >
                                  <Users className="w-3 h-3 text-slate-400 shrink-0" /> {name}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>

                    </div>
                  )}
                </div>

                {/* Giỏ hàng - dạng bảng */}
                <div className="flex-1 overflow-y-auto p-4 max-h-96 lg:max-h-none">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2 text-slate-800">
                      <ShoppingCart className="w-4 h-4 text-slate-400" />
                      <span className="font-bold text-xs uppercase">Giỏ hàng ({orderItems.length})</span>
                    </div>
                    {orderItems.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => setIsCartModalOpen(true)}
                        className="text-[10px] text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 font-black uppercase tracking-tighter h-7 px-2 gap-1">
                        <Expand className="w-3 h-3" /> Xem tất cả
                      </Button>
                    )}
                  </div>

                  {orderItems.length === 0 ? (
                    <div className="h-40 flex flex-col items-center justify-center text-slate-400">
                      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                        <ShoppingCart className="w-6 h-6 opacity-20" />
                      </div>
                      <p className="text-xs font-medium italic">Giỏ hàng của bạn đang trống</p>
                    </div>
                  ) : (
                    <table className="w-full text-sm border-separate border-spacing-y-1">
                      <thead>
                        <tr>
                          <th className="text-[10px] font-black text-slate-400 uppercase text-center w-7 pb-2">#</th>
                          <th className="text-[10px] font-black text-slate-400 uppercase text-left pb-2 pl-2">Tên</th>
                          <th className="text-[10px] font-black text-slate-400 uppercase text-center pb-2 w-28">Số lượng</th>
                          <th className="text-[10px] font-black text-slate-400 uppercase text-right pb-2 w-24">Đơn giá</th>
                          <th className="text-[10px] font-black text-slate-400 uppercase text-right pb-2 w-24">Thành tiền</th>
                          <th className="w-8 pb-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {orderItems.map((item, index) => (
                          <tr
                            key={item.id ?? index}
                            ref={(el: HTMLTableRowElement | null) => void (itemRefs.current[index] = el)}
                            className="group bg-white hover:bg-indigo-50/40 transition-colors rounded-xl"
                          >
                            {/* STT */}
                            <td className="text-center rounded-l-xl py-3 pl-2">
                              <span className="w-5 h-5 inline-flex items-center justify-center bg-slate-100 group-hover:bg-indigo-100 group-hover:text-indigo-600 rounded-full text-[10px] font-black text-slate-400 transition-colors">
                                {index + 1}
                              </span>
                            </td>

                            {/* Tên */}
                            <td className="py-3 pl-2 pr-2">
                              <div className="flex flex-col">
                                <span className="font-semibold text-slate-800 text-xs leading-snug line-clamp-2">
                                  {item.productName}
                                </span>
                                <input
                                  type="text"
                                  placeholder="Ghi chú món..."
                                  className="text-[10px] text-slate-400 bg-transparent border-none outline-none focus:text-indigo-600 focus:placeholder-indigo-300 w-full p-0 italic"
                                  value={localItemNotes[item.productId] || ''}
                                  onChange={(e) => handleNoteChange(item.productId, e.target.value)}
                                />
                              </div>
                            </td>

                            {/* Số lượng */}
                            <td className="py-3 text-center">
                              <div className="flex items-center justify-center bg-slate-100 rounded-lg p-0.5 gap-0.5 mx-auto w-fit">
                                <button
                                  onClick={() => {
                                    handleUpdateOrderItem(index, { quantity: item.quantity - 1, price: item.price });
                                  }}
                                  className="w-6 h-6 flex items-center justify-center bg-white rounded-md shadow-sm text-slate-500 hover:text-indigo-600 transition-colors"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <input
                                  type="text"
                                  className="w-7 text-center text-xs font-black text-slate-700 bg-transparent outline-none"
                                  value={editingQuantities[index] ?? item.quantity}
                                  onChange={(e) => handleQuantityChange(index, e.target.value)}
                                  onBlur={() => handleQuantityBlur(index)}
                                />
                                <button
                                  onClick={() => {
                                    handleUpdateOrderItem(index, { quantity: item.quantity + 1, price: item.price });
                                  }}
                                  className="w-6 h-6 flex items-center justify-center bg-white rounded-md shadow-sm text-slate-500 hover:text-indigo-600 transition-colors"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            </td>

                            {/* Đơn giá */}
                            <td className="py-3 text-right pr-2">
                              <div className="flex items-center justify-end gap-0.5">
                                <input
                                  type="text"
                                  className="w-20 text-right text-xs font-bold text-slate-600 bg-transparent outline-none focus:bg-slate-100 rounded transition-colors border border-transparent focus:border-indigo-100 p-0.5"
                                  value={
                                    editingPrices[index] !== undefined
                                      ? editingPrices[index]
                                      : item.price.toLocaleString('vi-VN')
                                  }
                                  onChange={(e) => handlePriceChange(index, e.target.value)}
                                  onBlur={() => handlePriceBlur(index)}
                                  onFocus={(e) => {
                                    if (editingPrices[index] === undefined) {
                                      handlePriceChange(index, item.price.toString());
                                    }
                                    (e.target as HTMLInputElement).select();
                                  }}
                                />
                                <span className="text-[10px] font-bold text-slate-400">đ</span>
                              </div>
                            </td>

                            {/* Thành tiền */}
                            <td className="py-3 text-right pr-2">
                              <span className="text-xs font-black text-indigo-600">
                                {(item.price * item.quantity).toLocaleString('vi-VN')}đ
                              </span>
                            </td>

                            {/* Xóa */}
                            <td className="py-3 text-center rounded-r-xl pr-1">
                              <button
                                onClick={() => handleRemoveItem(index)}
                                className="p-1 rounded-md text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="p-4 lg:p-6 bg-white border-t border-slate-100">
                  {/* Voucher Desktop */}
                  <div className="mb-4">
                    {!voucherApplied ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Nhập mã voucher..."
                          value={voucherCode}
                          onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                          onKeyDown={(e) => e.key === 'Enter' && handleApplyVoucher()}
                          className="flex-1 h-9 bg-slate-50 border border-slate-200 rounded-xl px-3 text-xs font-bold placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-200 uppercase"
                        />
                        <button
                          onClick={handleApplyVoucher}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 rounded-xl text-xs font-bold transition active:scale-95 whitespace-nowrap"
                        >
                          Áp dụng
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-xs font-bold text-emerald-700">Voucher <span className="uppercase">{voucherCode}</span> — Giảm 10%</span>
                        </div>
                        <button onClick={handleRemoveVoucher} className="text-slate-400 hover:text-slate-600 transition">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Dòng tổng — thêm discount vào giữa */}
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-8">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tiền phòng ({durationText})</span>
                        <div className="flex items-baseline gap-1">
                          <span className="text-sm font-bold text-slate-700">{roomChargeTotal.toLocaleString('vi-VN')}</span>
                          <span className="text-[10px] text-slate-400 font-medium">đ</span>
                        </div>
                      </div>
                      <div className="w-px h-8 bg-slate-100" />
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tiền dịch vụ</span>
                        <div className="flex items-baseline gap-1">
                          <span className="text-sm font-bold text-slate-700">{totalProductCost.toLocaleString('vi-VN')}</span>
                          <span className="text-[10px] text-slate-400 font-medium">đ</span>
                        </div>
                      </div>
                      {voucherApplied && (
                        <>
                          <div className="w-px h-8 bg-slate-100" />
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Giảm giá (10%)</span>
                            <div className="flex items-baseline gap-1">
                              <span className="text-sm font-bold text-emerald-600">-{discountAmount.toLocaleString('vi-VN')}</span>
                              <span className="text-[10px] text-emerald-400 font-medium">đ</span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Tổng thanh toán</span>
                      <div className="flex items-baseline gap-1 text-indigo-600">
                        <span className="text-2xl lg:text-3xl font-black tracking-tighter leading-none">{finalTotal.toLocaleString('vi-VN')}</span>
                        <span className="text-xs font-bold uppercase">đ</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      {(session?.status === 'paused' || (session as any)?.Status === 'paused') ? (
                        <>
                          <Button onClick={handleResumeSession} className="bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase rounded-2xl h-14 text-xs">
                            <Play className="w-4 h-4 mr-2 fill-current" /> Tiếp tục
                          </Button>
                          <Button onClick={() => window.print()} variant="outline" className="border-slate-200 text-slate-600 hover:bg-slate-50 rounded-2xl font-black h-14 text-xs">
                            <ReceiptText className="w-4 h-4 mr-2" /> In
                          </Button>
                        </>
                      ) : (
                        <Button onClick={handlePauseSession} variant="outline" className="col-span-2 border-amber-200 text-amber-600 hover:bg-amber-50 font-black rounded-2xl h-14 text-xs">
                          <Clock className="w-4 h-4 mr-2" /> Tạm tính
                        </Button>
                      )}
                    </div>
                    <Button onClick={handleGenerateInvoice}
                      disabled={!!timeError || (durationMinutes === 0 && orderItems.length === 0)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase rounded-2xl h-14 shadow-xl transition-all active:scale-95 text-xs">
                      <CheckCircle2 className="w-4 h-4 mr-2" /> THANH TOÁN
                    </Button>
                  </div>
                </div>
              </div>

              {/* Right column — Product menu */}
              <div className="flex-1 min-w-0 flex flex-col p-4 lg:p-5 overflow-hidden order-2 lg:order-1 bg-slate-50/50">

                {/* ── Toolbar: Search + Categories ── */}
                <div className="mb-4 space-y-3">

                  {/* Search bar */}
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <Input
                      placeholder="Tìm món ăn, đồ uống..."
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setShowProductSuggestions(true);
                        setSelectedIndex(-1);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setSelectedIndex(prev => (prev < productSuggestions.length - 1 ? prev + 1 : prev));
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setSelectedIndex(prev => (prev > -1 ? prev - 1 : -1));
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                          if (selectedIndex >= 0 && productSuggestions[selectedIndex]) {
                            if (!session) {
                              toast.error('Vui lòng mở phòng để bắt đầu order');
                              return;
                            }
                            handleAddProduct(productSuggestions[selectedIndex].id, 1);
                            setSearchTerm('');
                            setShowProductSuggestions(false);
                            setSelectedIndex(-1);
                          } else {
                            handleSearchEnter();
                          }
                        }
                      }}
                      onFocus={() => setShowProductSuggestions(true)}
                      onBlur={() => setTimeout(() => { setShowProductSuggestions(false); setSelectedIndex(-1); }, 200)}
                      className="pl-11 pr-10 h-11 rounded-xl bg-white border border-slate-200 text-sm shadow-sm focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 transition placeholder:text-slate-400"
                    />
                    {searchTerm && (
                      <button
                        onClick={() => setSearchTerm('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-200 hover:bg-slate-300 flex items-center justify-center transition"
                      >
                        <X className="w-3 h-3 text-slate-500" />
                      </button>
                    )}

                    {/* Suggestions dropdown */}
                    {showProductSuggestions && productSuggestions.length > 0 && (
                      <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-2xl mt-1 shadow-2xl max-h-64 overflow-auto py-1.5 ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-100">
                        {productSuggestions.map((product, index) => (
                          <li
                            key={product.id}
                            ref={(el) => { suggestionRefs.current[index] = el; }}
                            onClick={() => {
                              if (!session) {
                                toast.error('Vui lòng mở phòng để bắt đầu order');
                                return;
                              }
                              handleAddProduct(product.id, 1);
                              setSearchTerm('');
                              setShowProductSuggestions(false);
                            }}
                            className={`px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-indigo-50 border-b border-slate-50 last:border-0 cursor-pointer flex justify-between items-center group transition-colors ${index === selectedIndex ? 'bg-indigo-50' : ''}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="p-1.5 rounded-lg bg-slate-100 group-hover:bg-indigo-100 transition-colors shrink-0">
                                <Package className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600" />
                              </div>
                              <span>{product.name}</span>
                            </div>
                            <div className="text-right shrink-0 ml-4">
                              <div className="text-indigo-600 font-black text-sm">{product.price.toLocaleString('vi-VN')}đ</div>
                              <div className="text-[10px] text-slate-400 font-bold">Kho: {product.quantity}</div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Category tabs + Add button */}
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                    <button
                      onClick={handleOpenAddProduct}
                      className="shrink-0 flex items-center gap-1.5 h-9 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-200 transition active:scale-95 whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Thêm món
                    </button>
                    <div className="w-px h-6 bg-slate-200 shrink-0" />
                    {DESKTOP_CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setActiveCategory(cat.id)}
                        className={`flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap transition active:scale-95
            ${activeCategory === cat.id
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300 hover:text-slate-700'
                          }`}
                      >
                        {cat.icon}
                        {cat.name}
                        {activeCategory === cat.id && desktopFiltered.length > 0 && (
                          <span className="ml-0.5 bg-white/20 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
                            {desktopFiltered.length}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Product Grid ── */}
                <div className="flex-1 overflow-y-auto pr-0.5">
                  {desktopFiltered.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center py-16 text-slate-400 bg-white rounded-2xl border-2 border-dashed border-slate-200">
                      <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mb-4">
                        <Box className="w-7 h-7 opacity-30" />
                      </div>
                      <p className="text-sm font-semibold text-slate-500 mb-1">Không tìm thấy sản phẩm</p>
                      <p className="text-xs text-slate-400 mb-5">
                        {searchTerm ? `Không có kết quả cho "${searchTerm}"` : 'Danh mục này chưa có sản phẩm'}
                      </p>
                      {searchTerm && (
                        <button
                          onClick={handleOpenAddProduct}
                          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-100 transition active:scale-95"
                        >
                          <Plus className="w-4 h-4" /> Tạo món "{searchTerm}"
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                      {desktopFiltered.map((product) => {
                        const inCart = orderItems.find((item) => item.productId === product.id)?.quantity || 0;
                        const available = product.quantity - inCart;
                        const outOfStock = product.quantity <= 0;
                        const lowStock = available > 0 && available <= 5;

                        return (
                          <div
                            key={product.id}
                            onClick={(e) => {
                              if ((e.target as HTMLElement).closest('button')) return;
                              !outOfStock && handleAddProduct(product.id, 1);
                            }}
                            className={`group relative bg-white rounded-2xl border transition-all flex flex-col
                ${outOfStock
                                ? 'opacity-40 cursor-not-allowed border-slate-100'
                                : inCart > 0
                                  ? 'cursor-pointer border-indigo-300 shadow-sm shadow-indigo-100 hover:shadow-md hover:shadow-indigo-100'
                                  : 'cursor-pointer border-slate-100 hover:border-slate-200 hover:shadow-md'
                              }`}
                          >
                            <div className="p-3.5 flex-1 flex flex-col">
                              {/* Tên */}
                              <div className="font-semibold text-slate-800 text-sm line-clamp-2 leading-snug mb-1.5 flex-1">
                                {product.name}
                              </div>

                              {/* Giá */}
                              <div className="text-indigo-600 font-black text-base leading-none mb-3">
                                {product.price.toLocaleString('vi-VN')}đ
                              </div>

                              {/* Footer: tồn kho + actions */}
                              <div className="flex items-center justify-between">
                                <span className={`text-[10px] font-bold px-2 py-1 rounded-lg
                    ${outOfStock
                                    ? 'bg-red-50 text-red-400'
                                    : lowStock
                                      ? 'bg-orange-50 text-orange-500'
                                      : 'bg-emerald-50 text-emerald-600'
                                  }`}>
                                  {outOfStock ? 'Hết hàng' : `${available} còn`}
                                </span>

                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleOpenEditProduct(product); }}
                                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-50 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-100 transition active:scale-90"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  {!outOfStock && (
                                    <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-900 group-hover:bg-indigo-600 text-white transition">
                                      <Plus className="w-4 h-4" />
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-4 lg:p-8">
              <Card className="bg-white border-none p-8 lg:p-16 text-center max-w-lg shadow-[0_40px_100px_rgba(0,0,0,0.05)] rounded-4xl lg:rounded-6xl">
                <div className="w-16 h-16 lg:w-24 lg:h-24 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6 lg:mb-8 animate-bounce">
                  <Clock className="w-8 h-8 lg:w-12 lg:h-12 text-indigo-600" />
                </div>
                <p className="text-slate-600 mb-4">Phòng chưa được sử dụng</p>
                <p className="text-slate-400 text-xs lg:text-sm mb-8 lg:mb-10 leading-relaxed px-4 lg:px-10">
                  Nhấn nút bên dưới để mở phòng, gọi món trước và bắt đầu tính giờ khi khách vào.
                </p>
                <Button onClick={handleStartSession}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white w-full py-6 lg:py-8 text-lg lg:text-xl font-black rounded-2xl lg:rounded-3xl shadow-2xl shadow-indigo-100 transition-all active:scale-95">
                  MỞ PHÒNG / ORDER TRƯỚC
                </Button>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* ── Print template ── */}
      {session && (
        <div className="hidden print:block w-[80mm] mx-auto px-4 pt-2 pb-4 bg-white text-black font-bold"
          style={{
            fontFamily: "'Courier New', Consolas, monospace",
            WebkitFontSmoothing: 'none',
            MozOsxFontSmoothing: 'unset',
            textRendering: 'geometricPrecision'
          }}>
          <style dangerouslySetInnerHTML={{
            __html: `
            @media print {
              body { -webkit-print-color-adjust: exact; }
              * {
                color: #000 !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
                text-shadow: none !important;
                -webkit-font-smoothing: none !important;
                -moz-osx-font-smoothing: unset !important;
                font-smooth: never !important;
                text-rendering: geometricPrecision !important;
                font-weight: 700 !important;
              }
              @page { margin: 0; size: 80mm auto; }
            }
          `
          }} />
          {/* Tiêu đề */}
          <div className="text-center mb-2" style={{ paddingBottom: 6 }}>
            <h2 className="text-[22px] font-black tracking-wider mt-1 uppercase">Phiếu Tạm Tính</h2>
            <p className="text-[11px] font-black">Mã: HD{String(session.id || (session as any).Id).substring(0, 6).toUpperCase()}</p>
            <p className="text-[13px] font-black">Phòng: {room.roomNumber}</p>
            {customerName && <p className="text-[12px] tracking-wide">Khách hàng: {customerName}</p>}
          </div>
          {/* Bảng chi tiết */}
          <table className="w-full text-[13px] mb-2" style={{ borderCollapse: 'collapse', lineHeight: 1.6 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #000' }}>
                <th className="text-left py-1 text-[11px] tracking-wide uppercase">Chi tiết</th>
                <th className="text-center py-1 text-[11px] tracking-wide">SL</th>
                <th className="text-right py-1 text-[11px] tracking-wide uppercase">T.Tiền</th>
              </tr>
            </thead>
            <tbody>
              {/* Tiền phòng */}
              <tr>
                <td className="py-1.5">
                  <div className="font-bold">Tiền phòng</div>
                  <div className="text-[11px] font-normal text-black">Giá: {customPricePerHour.toLocaleString('vi-VN')}đ/h</div>
                  <div className="text-[11px] font-semibold text-black" style={{ lineHeight: 1.5 }}>
                    {selectedStartTime ? new Date(selectedStartTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                    {' - '}
                    {selectedEndTime ? new Date(selectedEndTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                    {' '}({durationText})
                  </div>
                </td>
                <td className="text-center py-1.5">{(durationMinutes / 60).toFixed(2)}</td>
                <td className="text-right py-1.5 font-black">{roomChargeTotal.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}</td>
              </tr>
              {/* Các món */}
              {orderItems.map((item, index) => (
                <tr key={item.id ?? index} style={{ borderTop: '1px dashed #000' }}>
                  <td className="py-1.5 text-wrap break-word max-w-[40mm]">
                    <div className="font-bold leading-tight">{item.productName}</div>
                    {localItemNotes[item.productId] && <div className="text-[12px] font-normal italic text-black">Ghi chú: {localItemNotes[item.productId]}</div>}
                    <div className="text-[11px] font-normal text-black">Giá: {item.price.toLocaleString('vi-VN')}</div>
                  </td>
                  <td className="text-center py-1.5">{item.quantity}</td>
                  <td className="text-right py-1.5 font-black">{(item.price * item.quantity).toLocaleString('vi-VN', { maximumFractionDigits: 0 })}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Tổng */}
          <div style={{ paddingTop: 6 }}>
            <div className="flex justify-between text-[12px] font-black" style={{ letterSpacing: '0.5px' }}>
              <span>Tổng chi phí:</span>
              <span>{(Math.ceil(total / 1000) * 1000).toLocaleString('vi-VN', { maximumFractionDigits: 0 })}</span>
            </div>
            <div className="flex justify-between text-[12px] font-black mt-1" style={{ letterSpacing: '0.5px' }}>
              <span>Chiết khấu:</span>
              <span>0%</span>
            </div>
            {voucherApplied && (
              <div className="flex justify-between text-[12px] font-black mt-1">
                <span>Voucher ({voucherCode}):</span>
                <span>-{discountAmount.toLocaleString('vi-VN')}</span>
              </div>
            )}
          </div>
          <div className="flex justify-between text-[18px] font-black mt-4 pt-2"
            style={{ borderTop: '2px solid #000', letterSpacing: '0.5px' }}>
            <span>TỔNG CỘNG:</span>
            <span>{finalTotal.toLocaleString('vi-VN')}</span>
          </div>
          {/* Dòng ghi tay hoa hồng (Không lưu CSDL) */}
          <div className="mt-6 mb-2 flex justify-between text-[13px] font-bold italic pt-2">
          </div>
          {/* Footer */}
          <div className="text-center text-black mt-4"
            style={{ borderTop: '2px dashed #000', paddingTop: 8, fontSize: 11, breakInside: 'avoid' }}>
            <p className="font-black uppercase mb-1">Cảm ơn quý khách!</p>
            <p className="font-normal text-[11px]">Hẹn gặp lại</p>
          </div>
        </div>
      )}

      {/* ── Desktop Cart Modal ── */}
      <Dialog open={isCartModalOpen} onOpenChange={setIsCartModalOpen}>
        <DialogContent id="cart-modal-content" className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-4xl">
          <DialogHeader className="p-6 pb-0">
            <div className="flex items-center gap-3 text-indigo-600 mb-2">
              <ShoppingCart className="w-6 h-6" />
              <DialogTitle className="text-2xl font-black uppercase tracking-tight">Chi tiết giỏ hàng</DialogTitle>
            </div>
            <DialogDescription className="font-medium text-slate-500">
              Kiểm tra danh sách món ăn, chỉnh sửa số lượng hoặc xóa món trước khi thanh toán.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {orderItems.length === 0 ? (
              <div className="py-20 text-center text-slate-400">Giỏ hàng hiện đang trống</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {orderItems.map((item, index) => (
                  <div
                    key={item.id ?? index}
                    ref={(el: HTMLDivElement | null) => void (itemRefs.current[index] = el)}
                    className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 first:pt-0">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-6 h-6 flex items-center justify-center bg-slate-100 rounded-full text-xs font-black text-slate-400 shrink-0">
                        {index + 1}
                      </div>
                      <div className="flex-1 w-full sm:min-w-0">
                        <div className="font-bold text-slate-900 text-sm sm:text-base text-wrap break-word leading-snug">{item.productName}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{item.price.toLocaleString('vi-VN')}đ</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-6 w-full sm:w-auto">
                      <div className="flex items-center bg-slate-100 rounded-xl p-1">
                        <button onClick={() => handleUpdateOrderItem(index, { quantity: item.quantity - 1, price: item.price })} className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-sm text-slate-600 hover:text-indigo-600 transition-colors"><Minus className="w-4 h-4" /></button>
                        <div
                          onClick={() => {
                            const p = products.find(prod => prod.id === item.productId);
                            if (p) handleOpenOrderQuantityModal(p);
                          }}
                          className="w-12 h-8 flex items-center justify-center font-black text-slate-900 text-sm cursor-pointer hover:bg-white/50 rounded-lg transition-colors"
                        >
                          {item.quantity}
                        </div>
                        <button onClick={() => handleUpdateOrderItem(index, { quantity: item.quantity + 1, price: item.price })} className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-sm text-slate-600 hover:text-indigo-600 transition-colors"><Plus className="w-4 h-4" /></button>
                      </div>
                      <div className="min-w-20 text-right font-black text-indigo-600 text-sm sm:text-base">
                        {(item.price * item.quantity).toLocaleString('vi-VN', { maximumFractionDigits: 0 })}đ
                      </div>
                      <button onClick={() => handleRemoveItem(index)} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <div className="flex gap-8">
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tiền phòng</span>
                <span className="text-lg font-bold text-slate-700">{roomChargeTotal.toLocaleString('vi-VN')}đ</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tiền dịch vụ</span>
                <span className="text-lg font-bold text-slate-700">{totalProductCost.toLocaleString('vi-VN')}đ</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Tổng cộng</span>
                <span className="text-2xl font-black text-indigo-600">{finalTotal.toLocaleString('vi-VN')}đ</span>
              </div>
            </div>

          </div>
        </DialogContent>
      </Dialog>

      {/* ── Transfer Room Modal ── */}
      <Dialog open={isTransferModalOpen} onOpenChange={setIsTransferModalOpen}>
        <DialogContent className="max-w-md rounded-4xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight text-indigo-600">Chọn phòng chuyển đến</DialogTitle>
            <DialogDescription className="font-medium">
              Chuyển toàn bộ dịch vụ từ phòng {room.roomNumber} sang một phòng trống khác.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 mt-4">
            {availableRooms.length > 0 ? (
              availableRooms.map((r) => (
                <Button key={r.id} variant="outline"
                  className="h-20 flex flex-col font-bold border-2 hover:border-indigo-500 hover:text-indigo-600 rounded-2xl transition-all"
                  onClick={() => { setIsTransferModalOpen(false); handleTransferRoom(r.id); }}>
                  <span className="text-lg">P. {r.roomNumber}</span>
                  <span className="text-[10px] text-slate-400 font-normal">Sức chứa: {r.capacity}</span>
                </Button>
              ))
            ) : (
              <p className="col-span-2 text-center py-8 text-slate-500 italic text-sm">Không có phòng nào đang trống</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Quick Edit Product Modal (Desktop) ── */}
      <Dialog open={isEditProductModalOpen} onOpenChange={setIsEditProductModalOpen}>
        <DialogContent className="max-w-md rounded-4xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight text-indigo-600">Chỉnh sửa sản phẩm</DialogTitle>
            <DialogDescription className="font-medium">Thay đổi thông tin gốc của sản phẩm trong thực đơn.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateProductFromMenu} className="space-y-4 mt-2">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Tên sản phẩm</label>
              <Input required value={newProductForm.name} onChange={e => setNewProductForm({ ...newProductForm, name: e.target.value })} className="rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Loại</label>
                <Select value={newProductForm.category} onValueChange={(val) => setNewProductForm({ ...newProductForm, category: val as any })}>
                  <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white text-sm"><SelectValue placeholder="Chọn loại" /></SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    <SelectItem value="food">Đồ ăn</SelectItem>
                    <SelectItem value="drink">Đồ uống</SelectItem>
                    <SelectItem value="dry">Đồ khô</SelectItem>
                    <SelectItem value="fruit">Trái cây</SelectItem>
                    <SelectItem value="other">Khác</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Giá bán</label>
                <Input required type="text"
                  value={newProductForm.price ? Number(newProductForm.price).toLocaleString('vi-VN') : ''}
                  onChange={e => { const val = e.target.value.replace(/\D/g, ''); setNewProductForm({ ...newProductForm, price: val }); }}
                  className="rounded-xl font-bold text-indigo-600" />
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Số lượng kho (Hiện có)</label>
                <Input type="number" value={newProductForm.quantity} onChange={e => setNewProductForm({ ...newProductForm, quantity: e.target.value })} className="rounded-xl font-bold" />
              </div>
            </div>
            <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 h-12 rounded-xl font-bold mt-4 shadow-lg shadow-indigo-100">Cập nhật thông tin</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Quick Add Product Modal (Desktop) ── */}
      <Dialog open={isAddProductModalOpen} onOpenChange={setIsAddProductModalOpen}>
        <DialogContent className="max-w-md rounded-4xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight text-indigo-600">Thêm sản phẩm mới</DialogTitle>
            <DialogDescription className="font-medium">Tạo món mới nhanh chóng mà không cần rời trang order.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateProduct} className="space-y-4 mt-2">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Tên sản phẩm</label>
              <Input required value={newProductForm.name} onChange={e => setNewProductForm({ ...newProductForm, name: e.target.value })} placeholder="Nhập tên món..." className="rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Loại</label>
                <Select value={newProductForm.category} onValueChange={(val) => setNewProductForm({ ...newProductForm, category: val as any })}>
                  <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white text-sm"><SelectValue placeholder="Chọn loại" /></SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    <SelectItem value="food">Đồ ăn</SelectItem>
                    <SelectItem value="drink">Đồ uống</SelectItem>
                    <SelectItem value="dry">Đồ khô</SelectItem>
                    <SelectItem value="fruit">Trái cây</SelectItem>
                    <SelectItem value="other">Khác</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Giá bán</label>
                <Input required type="text"
                  value={newProductForm.price ? Number(newProductForm.price).toLocaleString('vi-VN') : ''}
                  onChange={e => { const val = e.target.value.replace(/\D/g, ''); setNewProductForm({ ...newProductForm, price: val }); }}
                  placeholder="0" className="rounded-xl" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Số lượng nhập kho</label>
              <Input type="number" value={newProductForm.quantity} onChange={e => setNewProductForm({ ...newProductForm, quantity: e.target.value })} className="rounded-xl" />
            </div>
            <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 h-12 rounded-xl font-bold mt-4 shadow-lg shadow-indigo-100">Lưu sản phẩm</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}