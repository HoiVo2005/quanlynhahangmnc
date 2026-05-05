import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('storeId');
    const type = searchParams.get('type') || 'daily';
    const startParam = searchParams.get('startDate');
    const endParam = searchParams.get('endDate');

    if (!storeId) {
        return NextResponse.json({ error: 'Missing storeId' }, { status: 400 });
    }

    try {
        /* ───────────────────────────────────────────── */
        /* 1. TIME RANGE (FIX TIMEZONE)                  */
        /* ───────────────────────────────────────────── */

        const now = new Date();
        let startDate: Date;
        let endDate: Date;

        if (startParam) {
            startDate = new Date(startParam + 'T00:00:00.000Z');
            endDate = endParam
                ? new Date(endParam + 'T23:59:59.999Z')
                : new Date();
        } else {
            endDate = new Date();
            endDate.setHours(23, 59, 59, 999);

            startDate = new Date();

            if (type === 'daily') {
                startDate.setHours(0, 0, 0, 0);
            } else if (type === 'weekly') {
                const day = now.getDay();
                const diff = day === 0 ? -6 : 1 - day;
                startDate.setDate(now.getDate() + diff);
                startDate.setHours(0, 0, 0, 0);
            } else if (type === 'monthly') {
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            } else if (type === 'yearly') {
                startDate = new Date(now.getFullYear(), 0, 1);
            } else {
                startDate.setHours(0, 0, 0, 0);
            }
        }

        /* ───────────────────────────────────────────── */
        /* 2. PRODUCTS                                  */
        /* ───────────────────────────────────────────── */

        const products = await prisma.product.findMany({
            where: { StoreId: storeId },
        });

        /* ───────────────────────────────────────────── */
        /* 3. SALES FROM PAID INVOICES ONLY             */
        /* ───────────────────────────────────────────── */

        // Tìm các phiên phòng BẮT ĐẦU trong kỳ và ĐÃ THANH TOÁN (có hóa đơn)
        // Sử dụng StartTime thay vì CreatedAt của Invoice
        const sessionsInPeriod = await prisma.roomSession.findMany({
            where: {
                StoreId: storeId,
                StartTime: { gte: startDate, lte: endDate },
                // Chỉ tính những phòng đã chốt (tránh tính nhầm hàng đang dùng trong phòng chưa thanh toán vào báo cáo doanh thu/bán chạy)
                OR: [
                    { Status: 'completed' },
                    { Invoices: { some: { Status: 'paid' } } }
                ]
            },
            select: { Id: true },
        });
        const sessionIdsInPeriod = sessionsInPeriod.map(s => s.Id);

        // Tương tự cho mốc tính tồn đầu
        const sessionsSinceStart = await prisma.roomSession.findMany({
            where: {
                StoreId: storeId,
                StartTime: { gte: startDate },
                OR: [
                    { Status: 'completed' },
                    { Invoices: { some: { Status: 'paid' } } }
                ]
            },
            select: { Id: true },
        });
        const sessionIdsSinceStart = sessionsSinceStart.map(s => s.Id);

        // Bán trong kỳ
        const salesInPeriod = await prisma.orderItem.groupBy({
            by: ['ProductId'],
            where: { RoomSessionId: { in: sessionIdsInPeriod } },
            _sum: { Quantity: true },
        });

        // Bán từ mốc xem báo cáo đến hiện tại
        const salesSinceStart = await prisma.orderItem.groupBy({
            by: ['ProductId'],
            where: { RoomSessionId: { in: sessionIdsSinceStart } },
            _sum: { Quantity: true },
        });

        /* ───────────────────────────────────────────── */
        /* 5. INVENTORY LOG                             */
        /* ───────────────────────────────────────────── */

        // Kiểm tra an toàn sự tồn tại của model inventoryLog trong Prisma
        const logModel = (prisma as any).inventoryLog;

        // Nhập trong kỳ
        const restocksInPeriod = logModel ? await logModel.groupBy({
            by: ['ProductId'],
            where: {
                StoreId: storeId,
                CreatedAt: { gte: startDate, lte: endDate },
                Quantity: { gt: 0 },
            },
            _sum: { Quantity: true },
        }) : [];

        // Xuất lẻ trong kỳ
        const exportsInPeriod = logModel ? await logModel.groupBy({
            by: ['ProductId'],
            where: {
                StoreId: storeId,
                CreatedAt: { gte: startDate, lte: endDate },
                Quantity: { lt: 0 },
                // Không tính các log mang về/tặng vì đã tính ở mục Sales (OrderItem)
                Type: { notIn: ['export', 'gift'] }
            },
            _sum: { Quantity: true },
        }) : [];

        // 🔥 QUAN TRỌNG: KHÔNG excludeInit ở đây

        // Nhập từ start → hiện tại
        const importSinceStart = logModel ? await logModel.groupBy({
            by: ['ProductId'],
            where: {
                StoreId: storeId,
                CreatedAt: { gte: startDate },
                Quantity: { gt: 0 },
            },
            _sum: { Quantity: true },
        }) : [];

        // Xuất lẻ từ start → hiện tại
        const exportSinceStart = logModel ? await logModel.groupBy({
            by: ['ProductId'],
            where: {
                StoreId: storeId,
                CreatedAt: { gte: startDate },
                Quantity: { lt: 0 },
                Type: { notIn: ['export', 'gift'] }
            },
            _sum: { Quantity: true },
        }) : [];

        /* ───────────────────────────────────────────── */
        /* 6. LOG LIST                                  */
        /* ───────────────────────────────────────────── */

        const logs = logModel ? await logModel.findMany({
            where: {
                StoreId: storeId,
                CreatedAt: { gte: startDate, lte: endDate },
            },
            include: { product: true },
            orderBy: { CreatedAt: 'desc' },
        }) : [];

        /* ───────────────────────────────────────────── */
        /* 7. CALCULATE                                 */
        /* ───────────────────────────────────────────── */

        const safe = (n: any) => Number(n || 0);

        const stats = products.map(p => {
            // Bán trong kỳ
            const salePeriod = salesInPeriod.find((s: any) => s.ProductId === p.Id);
            const roomSales = safe(salePeriod?._sum?.Quantity);

            // Xuất lẻ trong kỳ
            const exportPeriod = exportsInPeriod.find((e: any) => e.ProductId === p.Id);
            const exported = Math.abs(safe(exportPeriod?._sum?.Quantity));

            const totalQuantity = roomSales + exported;

            // Nhập trong kỳ
            const restockPeriod = restocksInPeriod.find((r: any) => r.ProductId === p.Id);
            const totalRestocked = safe(restockPeriod?._sum?.Quantity);

            // 🔥 TÍNH TỒN ĐẦU (CHUẨN)
            const importRec = importSinceStart.find((i: any) => i.ProductId === p.Id);
            const totalImportedSinceStart = safe(importRec?._sum?.Quantity);

            const exportRec = exportSinceStart.find((e: any) => e.ProductId === p.Id);
            const totalExportedSinceStart = Math.abs(safe(exportRec?._sum?.Quantity));

            const soldRec = salesSinceStart.find((s: any) => s.ProductId === p.Id);
            const totalSoldSinceStart = safe(soldRec?._sum?.Quantity);

            const openingStock =
                p.Quantity
                - totalImportedSinceStart
                + totalExportedSinceStart
                + totalSoldSinceStart;

            // Tồn cuối kỳ = Tồn đầu + Nhập trong kỳ - (Bán + Xuất lẻ trong kỳ)
            const closingStock = openingStock + totalRestocked - totalQuantity;

            return {
                productId: p.Id,
                productName: p.Name,
                category: p.Category,
                openingStock: Math.max(0, openingStock),
                totalRestocked,
                totalSold: roomSales,
                totalExported: exported,
                totalQuantity,
                totalRevenue: totalQuantity * Number(p.Price || 0),
                currentStock: p.Quantity, // Đây là số 330 thực tế trong DB
                closingStock: closingStock, // Đây sẽ là số 378 cho ngày 1/5
            };
        });

        /* ───────────────────────────────────────────── */
        /* 8. RESPONSE                                  */
        /* ───────────────────────────────────────────── */

        return NextResponse.json({
            stats,
            logs: logs.map((l: any) => ({
                id: l.Id,
                productName: l.product?.Name || 'Sản phẩm đã xóa',
                quantity: l.Quantity,
                createdAt: l.CreatedAt,
                type: l.Type,
                note: l.Note,
            })),
            period: {
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                type,
            },
        });

    } catch (error) {
        console.error('Inventory Stats API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}