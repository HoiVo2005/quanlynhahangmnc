'use client';

import { useAuth } from '@/app/context';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Room, Store, RoomSession, Product } from '@/lib/db';
import { LayoutDashboard, DoorOpen, DoorClosed, Users, LogOut, Package, History, Store as StoreIcon, Clock, Banknote, ReceiptText, Home, BarChart3, ShoppingBag, Delete, X, Lock } from 'lucide-react';
import Swal from 'sweetalert2';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

// Ép trang này và các fetch bên trong chạy tại region Singapore để gần Database
export const preferredRegion = 'sin1';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'occupied' | 'empty'>('all');
  const [sessions, setSessions] = useState<Record<string, RoomSession>>({});
  const [sessionTotals, setSessionTotals] = useState<Record<string, number>>({});
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);

  // State cho khóa bảo vệ mới
  const [isLockModalOpen, setIsLockModalOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [targetPath, setTargetPath] = useState('');
  const [isPinError, setIsPinError] = useState(false);

  // Mật khẩu quản lý (tự định nghĩa tại đây)
  const ADMIN_PIN = "2531";

  const handleProtectedNavigation = (path: string) => {
    if (sessionStorage.getItem('dashboard_unlocked') === 'true') {
      router.push(path);
      return;
    }
    setTargetPath(path);
    setPinInput('');
    setIsLockModalOpen(true);
  };

  const handlePinClick = (num: string) => {
    if (pinInput.length < 4) {
      const newPin = pinInput + num;
      setPinInput(newPin);
      if (newPin.length === 4) verifyPin(newPin);
    }
  };

  const verifyPin = (pin: string) => {
    if (pin === ADMIN_PIN) {
      sessionStorage.setItem('dashboard_unlocked', 'true');
      setIsLockModalOpen(false);
      router.push(targetPath);
    } else {
      setIsPinError(true);
      toast.error('Mã PIN không chính xác!');
      setTimeout(() => {
        setIsPinError(false);
        setPinInput('');
      }, 500);
    }
  };

  const fetchRooms = useCallback(async (storeId: string) => {
    try {
      setSessions({});
      setSessionTotals({});

      // Tận dụng edge cache (s-maxage=10) — không bypass nữa.
      const response = await fetch(`/api/admin/rooms?storeId=${storeId}`);
      const rawData: Room[] = await response.json();

      // Lọc bỏ phòng ảo "MANG VỀ" (Id: EXTERNAL) để không hiển thị trên sơ đồ phòng chính
      const data = rawData.filter(r => (r.id ?? (r as any).Id) !== 'EXTERNAL');

      const sortedData = [...data].sort((a, b) => {
        const numA = parseInt(a.roomNumber?.toString().replace(/\D/g, '') || '0');
        const numB = parseInt(b.roomNumber?.toString().replace(/\D/g, '') || '0');

        if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
          return numA - numB;
        }
        if (!isNaN(numA) && isNaN(numB)) return -1;
        if (isNaN(numA) && !isNaN(numB)) return 1;
        return String(a.roomNumber).localeCompare(String(b.roomNumber), undefined, { numeric: true });
      });

      setRooms(sortedData);

      const occupiedRooms = data.filter(r => r.status === 'occupied');
      const sessionData: Record<string, RoomSession> = {};
      const totalsData: Record<string, number> = {};

      await Promise.all(occupiedRooms.map(async (room) => {
        try {
          // Tận dụng edge cache (s-maxage=10).
          const sessionRes = await fetch(`/api/rooms/session?roomId=${room.id}`);
          if (sessionRes.ok) {
            const session = await sessionRes.json();
            sessionData[room.id] = session;

            const sessionId = session.id || (session as any).Id;
            // Tận dụng edge cache (s-maxage=5).
            const ordersRes = await fetch(`/api/orders?sessionId=${sessionId}`);
            if (ordersRes.ok) {
              const orders = await ordersRes.json();
              const productSum = orders.reduce((sum: number, item: any) =>
                sum + (Number(item.price || item.Price || 0) * (item.quantity || item.Quantity || 0)), 0
              );
              totalsData[room.id] = productSum;
            }
          }
        } catch (err) {
          console.error(`Lỗi tải phiên cho phòng ${room.id}:`, err);
        }
      }));

      setSessions(sessionData);
      setSessionTotals(totalsData);
    } catch (error) {
      console.error('Error fetching rooms:', error);
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      // Tận dụng edge cache (s-maxage=300) — stores rất tĩnh.
      const storesRes = await fetch('/api/admin/stores');
      const storesData = await storesRes.json();
      setStores(storesData);

      const userStore = storesData.find((store: Store) => store.id === user?.storeId);
      const initialStoreId = userStore?.id || storesData[0]?.id;
      if (initialStoreId) {
        setSelectedStoreId(initialStoreId);
        fetchRooms(initialStoreId);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, fetchRooms]);

  useEffect(() => {
    if (user?.role === 'admin') {
      router.push('/dashboard/admin');
    } else {
      router.refresh();
      fetchData();
    }
  }, [user, router, fetchData]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const lastDashboardFetchRef = useRef(0);
  useEffect(() => {
    const handleFocus = () => {
      const now = Date.now();
      // Throttle bằng TTL edge cache (10s): trong 10s đầu hầu hết request
      // trả từ CDN nên không tốn function invoke; sau 10s cache hết hạn,
      // refetch để dashboard phản ánh trạng thái phòng mới mở.
      if (selectedStoreId && (now - lastDashboardFetchRef.current > 10000)) {
        fetchRooms(selectedStoreId);
        lastDashboardFetchRef.current = now;
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [selectedStoreId, fetchRooms]);

  const handleStoreChange = (storeId: string) => {
    setSelectedStoreId(storeId);
    fetchRooms(storeId);
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const selectedStore = stores.find((s) => s.id === selectedStoreId);
  const occupiedRooms = rooms.filter((r) => r.status === 'occupied').length;
  const emptyRooms = rooms.filter((r) => r.status === 'empty').length;

  const filteredRooms = rooms.filter((room) => {
    if (activeTab === 'all') return true;
    return room.status === activeTab;
  });

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <LayoutDashboard className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 hidden md:block">QUẢN LÝ HỆ THỐNG KARAOKE</h1>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <div className="hidden sm:flex flex-col items-end mr-2">
              <span className="text-slate-900 font-semibold text-sm">{user?.name}</span>
              <span className="text-slate-500 text-[10px] uppercase tracking-wider">{user?.role === 'admin' ? 'Quản trị viên' : 'Nhân viên'}</span>
            </div>

            {/* Ẩn 3 nút này trên mobile, chỉ hiện từ md trở lên */}
            <Button variant="ghost" size="sm" onClick={() => handleProtectedNavigation('/dashboard/invoice')} className="hidden md:flex text-slate-600 hover:text-blue-600 gap-2">
              <History className="w-4 h-4" />
              <span className="hidden md:inline">Lịch sử</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleProtectedNavigation('/dashboard/customers')} className="hidden md:flex text-slate-600 hover:text-indigo-600 gap-2">
              <Users className="w-4 h-4" />
              <span className="hidden md:inline">Khách hàng</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleProtectedNavigation('/dashboard/products')} className="hidden md:flex text-slate-600 hover:text-blue-600 gap-2">
              <Package className="w-4 h-4" />
              <span className="hidden md:inline">Thực đơn</span>
            </Button>
            <Link href="/dashboard/export" className="hidden md:flex">
              <Button variant="ghost" size="sm" className="text-slate-600 hover:text-indigo-600 gap-2 border border-slate-100 bg-white shadow-sm">
                <ShoppingBag className="w-4 h-4" />
                <span className="hidden md:inline">Bán mang về</span>
              </Button>
            </Link>

            <Button
              onClick={handleLogout}
              variant="ghost"
              size="sm"
              className="text-rose-600 hover:bg-rose-50 gap-2"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden md:inline">Thoát</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Filtering and Selection Header */}
          <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h2 className="text-xl font-bold text-slate-800">Danh sách phòng</h2>

            {user?.role === 'admin' && stores.length > 1 && (
              <div className="flex flex-wrap gap-2 items-center bg-slate-50 p-1 rounded-lg">
                {stores.map((store) => (
                  <button
                    key={store.id}
                    onClick={() => handleStoreChange(store.id)}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${selectedStoreId === store.id ? '' : ''}`}
                  >
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 sm:p-6 min-h-[400px]">
            {/* Tabs Filter */}
            <div className="flex flex-wrap gap-2 mb-6">
              {[
                { id: 'all', label: 'Tất cả', count: rooms.length, color: 'blue' },
                { id: 'occupied', label: 'Đang dùng', count: occupiedRooms, color: 'rose' },
                { id: 'empty', label: 'Đang trống', count: emptyRooms, color: 'green' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-5 py-2 rounded-xl text-sm font-bold transition-all border-2 flex items-center gap-2 ${activeTab === tab.id
                    ? 'bg-slate-900 border-slate-900 text-white shadow-md'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'
                    }`}
                >
                  {tab.label}
                  <span className={`px-2 py-0.5 rounded-lg text-[10px] ${activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center h-64 text-slate-500 font-medium">Đang tải dữ liệu...</div>
            ) : filteredRooms.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400 bg-slate-50 rounded-xl">
                <Package className="w-12 h-12 mb-2 opacity-20" />
                <p>{activeTab === 'all' ? 'Chưa có dữ liệu phòng' : 'Không có phòng nào ở trạng thái này'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
                {filteredRooms.map((room) => (
                  <Link key={room.id} href={`/dashboard/room/${room.id}`}>
                    <Card
                      className={`p-3 sm:p-6 h-auto min-h-[140px] sm:h-44 flex flex-col justify-between cursor-pointer transition-all border-2 ${room.status === 'empty'
                        ? 'bg-slate-100 border-blue-300 hover:border-blue-500 hover:bg-slate-200'
                        : 'bg-slate-100 border-red-400 hover:border-red-500 hover:bg-slate-200'
                        }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-1.5 sm:gap-3">
                          <div className={`p-1.5 sm:p-2 rounded-xl ${room.status === 'empty' ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'}`}>
                            <Home className="w-5 h-5" />
                          </div>
                          <h3 className="text-base sm:text-2xl font-bold text-slate-900 truncate">
                            P. {room.roomNumber}
                          </h3>
                        </div>
                        <div
                          className={`px-2 py-0.5 text-[10px] sm:text-xs font-semibold rounded-full whitespace-nowrap flex items-center justify-center ${room.status === 'empty'
                            ? 'bg-blue-100 text-blue-700'
                            : (((sessions[room.id] as any)?.status === 'paused' || (sessions[room.id] as any)?.Status === 'paused') ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700')
                            }`}
                        >
                          {room.status === 'empty'
                            ? 'Trống'
                            : (((sessions[room.id] as any)?.status === 'paused' || (sessions[room.id] as any)?.Status === 'paused')
                              ? <ReceiptText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                              : 'Dùng')
                          }
                        </div>
                      </div>

                      <div className="space-y-1.5 text-slate-600 text-sm mt-2 min-h-[52px]">
                        {room.status === 'occupied' && sessions[room.id] ? (
                          <div className="border-t border-slate-200 space-y-1">
                            <div className="flex items-center gap-1.5 text-blue-600 font-semibold">
                              <Clock className="w-3.5 h-3.5" />
                              <span className="text-[11px] sm:text-sm">
                                {(() => {
                                  const session = sessions[room.id];
                                  if (!session || (session as any).status === 'pending' || (session as any)?.Status === 'pending') return '0p';
                                  const start = new Date((session.startTime || (session as any).StartTime)).getTime();

                                  let end: number;
                                  const savedEnd = session.endTime || (session as any).EndTime;
                                  if (savedEnd) {
                                    end = new Date(savedEnd).getTime();
                                  } else {
                                    const isPaused = (session as any).status === 'paused' || (session as any)?.Status === 'paused';
                                    end = isPaused ? new Date(((session as any).updatedAt || (session as any).UpdatedAt || currentTime)).getTime() : currentTime.getTime();
                                  }

                                  const diffMs = end - start;
                                  if (diffMs <= 0) return '0p';
                                  const totalMinutes = Math.ceil(diffMs / 60000);
                                  const hours = Math.floor(totalMinutes / 60);
                                  const minutes = totalMinutes % 60;
                                  return hours > 0 ? `${hours}h ${minutes}p` : `${minutes}p`;
                                })()}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-rose-600 font-bold">
                              <Banknote className="w-3.5 h-3.5" />
                              <span className="text-[11px] sm:text-base">
                                {(() => {
                                  const session = sessions[room.id] as any;
                                  if (!session) return '0';
                                  let roomCharge = 0;
                                  const isPending = (session as any).status === 'pending' || (session as any)?.Status === 'pending';
                                  if (!isPending) {
                                    const start = new Date((session.startTime || (session as any).StartTime)).getTime();

                                    let end: number;
                                    const savedEnd = session.endTime || (session as any).EndTime;
                                    if (savedEnd) {
                                      end = new Date(savedEnd).getTime();
                                    } else {
                                      const isPaused = (session as any).status === 'paused' || (session as any)?.Status === 'paused';
                                      end = isPaused ? new Date(((session as any).updatedAt || (session as any).UpdatedAt || currentTime)).getTime() : currentTime.getTime();
                                    }

                                    const diffMs = end - start;
                                    if (diffMs > 0) {
                                      const minutes = Math.ceil(diffMs / 60000);
                                      roomCharge = Math.ceil((minutes * room.pricePerHour) / 60);
                                    }
                                  }
                                  const productTotal = sessionTotals[room.id] || 0;
                                  return (Math.ceil((roomCharge + productTotal) / 1000) * 1000).toLocaleString('vi-VN');
                                })()} <span className="text-[10px] font-normal">đ</span>
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="border-t border-slate-200 space-y-1 pt-1">
                            <div className="flex items-center gap-1.5 text-slate-300">
                              <Clock className="w-3.5 h-3.5" />
                              <span className="text-[11px] sm:text-sm">--</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-300">
                              <Banknote className="w-3.5 h-3.5" />
                              <span className="text-[11px] sm:text-base">--</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Custom PIN Pad Modal ── */}
      <Dialog open={isLockModalOpen} onOpenChange={setIsLockModalOpen}>
        <DialogContent className="w-[240px] rounded-[2.5rem] p-5 border-none shadow-2xl overflow-hidden bg-white/95 backdrop-blur-xl">
          <div className="flex flex-col items-center">
            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center mb-3">
              <Lock className="w-5 h-5 text-indigo-600" />
            </div>
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight mb-0.5 text-center">Xác thực PIN</h2>
            <p className="text-slate-400 text-[8px] font-bold uppercase tracking-widest mb-5 text-center">Quản lý hệ thống</p>

            {/* PIN Dots Display */}
            <div className={`flex gap-2.5 mb-6 ${isPinError ? 'animate-bounce' : ''}`}>
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={`w-2.5 h-2.5 rounded-full border-2 transition-all duration-200 
                    ${pinInput.length >= i
                      ? 'bg-indigo-600 border-indigo-600 scale-110'
                      : 'bg-transparent border-slate-200'}`}
                />
              ))}
            </div>

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-2 w-full">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                <button
                  key={num}
                  onClick={() => handlePinClick(num)}
                  className="w-full aspect-square rounded-xl bg-slate-50 hover:bg-indigo-50 active:scale-90 text-base font-black text-slate-700 transition-all"
                >
                  {num}
                </button>
              ))}
              <div />
              <button
                onClick={() => handlePinClick('0')}
                className="w-full aspect-square rounded-xl bg-slate-50 hover:bg-indigo-50 active:scale-90 text-base font-black text-slate-700 transition-all"
              >
                0
              </button>
              <button
                onClick={() => setPinInput(prev => prev.slice(0, -1))}
                className="w-full aspect-square rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-500 active:scale-90 transition-all"
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={() => setIsLockModalOpen(false)}
              className="mt-5 text-slate-400 text-[9px] font-bold uppercase hover:text-slate-600 transition tracking-widest"
            >
              Hủy bỏ
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}