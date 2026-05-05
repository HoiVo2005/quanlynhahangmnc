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
        /* 3. PAID INVOICES & SESSIONS                  */
        /* ───────────────────────────────────────────── */

        // Lấy danh sách ID các phiên phòng trong kỳ (không tính các phòng bị hủy)
        const sessionsInPeriod = await prisma.roomSession.findMany({
            where: {
                StoreId: storeId,
                Status: { not: 'cancelled' },
                StartTime: { gte: startDate, lte: endDate },
            },
            select: { Id: true },
        });
        const sessionIdsInPeriod = sessionsInPeriod.map(s => s.Id);

        // Lấy danh sách ID các phiên phòng từ lúc bắt đầu xem báo cáo đến hiện tại
        const sessionsSinceStart = await prisma.roomSession.findMany({
            where: {
                StoreId: storeId,
                Status: { not: 'cancelled' },
                StartTime: { gte: startDate },
            },
            select: { Id: true },
        });
        const sessionIdsSinceStart = sessionsSinceStart.map(s => s.Id);

        /* ───────────────────────────────────────────── */
        /* 4. SALES (ONLY FROM PAID BILLS)              */
        /* ───────────────────────────────────────────── */

        // Bán trong kỳ: Toàn bộ món trong các bill đã thanh toán thành công trong kỳ này
        const salesInPeriod = sessionIdsInPeriod.length > 0
            ? await prisma.orderItem.groupBy({
                by: ['ProductId'],
                where: { RoomSessionId: { in: sessionIdsInPeriod } },
                _sum: { Quantity: true },
            }) : [];

        // Bán từ lúc bắt đầu xem báo cáo đến nay (để phục vụ tính tồn đầu chính xác)
        const salesSinceStart = sessionIdsSinceStart.length > 0
            ? await prisma.orderItem.groupBy({
                by: ['ProductId'],
                where: { RoomSessionId: { in: sessionIdsSinceStart } },
                _sum: { Quantity: true },
            }) : [];

        /* ───────────────────────────────────────────── */
        /* 5. INVENTORY LOG                             */
        /* ───────────────────────────────────────────── */

        // Nhập trong kỳ
        const restocksInPeriod = await (prisma as any).inventoryLog.groupBy({
            by: ['ProductId'],
            where: {
                StoreId: storeId,
                CreatedAt: { gte: startDate, lte: endDate },
                Quantity: { gt: 0 },
            },
            _sum: { Quantity: true },
        });

        // Xuất lẻ trong kỳ
        const exportsInPeriod = await (prisma as any).inventoryLog.groupBy({
            by: ['ProductId'],
            where: {
                StoreId: storeId,
                CreatedAt: { gte: startDate, lte: endDate },
                Quantity: { lt: 0 },
            },
            _sum: { Quantity: true },
        });

        // 🔥 QUAN TRỌNG: KHÔNG excludeInit ở đây

        // Nhập từ start → hiện tại
        const importSinceStart = await (prisma as any).inventoryLog.groupBy({
            by: ['ProductId'],
            where: {
                StoreId: storeId,
                CreatedAt: { gte: startDate },
                Quantity: { gt: 0 },
            },
            _sum: { Quantity: true },
        });

        // Xuất lẻ từ start → hiện tại
        const exportSinceStart = await (prisma as any).inventoryLog.groupBy({
            by: ['ProductId'],
            where: {
                StoreId: storeId,
                CreatedAt: { gte: startDate },
                Quantity: { lt: 0 },
            },
            _sum: { Quantity: true },
        });

        /* ───────────────────────────────────────────── */
        /* 6. LOG LIST                                  */
        /* ───────────────────────────────────────────── */

        const logs = await (prisma as any).inventoryLog.findMany({
            where: {
                StoreId: storeId,
                CreatedAt: { gte: startDate, lte: endDate },
            },
            include: { product: true },
            orderBy: { CreatedAt: 'desc' },
        });

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