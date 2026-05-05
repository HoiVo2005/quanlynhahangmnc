import { prisma } from '@/lib/prisma';

const validCategories = ['food', 'drink', 'dry', 'towel', 'cake', 'fruit', 'other'] as const;

type ProductCategory = (typeof validCategories)[number];

// GET
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');

    const products = await prisma.product.findMany({
      where: storeId ? { StoreId: storeId } : {},
    });

    const formatted = products.map((p: any) => ({
      id: p.Id,
      storeId: p.StoreId,
      name: p.Name,
      category: p.Category,
      price: Number(p.Price),
      quantity: typeof p.Quantity === 'number' ? p.Quantity : 0,
      note: p.Note,
      createdAt: p.CreatedAt,
    }));

    return Response.json(formatted);
  } catch (error) {
    console.error(error);
    return Response.json([], { status: 500 }); // ⚠️ luôn trả array
  }
}

// POST
export async function POST(request: Request) {
  try {
    const { storeId, name, category, price, quantity, note, logNote } = await request.json();

    if (!storeId || !name || !category || price === undefined || price === null || quantity === undefined || quantity === null) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!validCategories.includes(category)) {
      return Response.json({ error: 'Invalid category' }, { status: 400 });
    }

    const priceValue = Number(price);
    const quantityValue = Number(quantity);
    if (isNaN(priceValue) || priceValue < 0) {
      return Response.json({ error: 'Invalid price' }, { status: 400 });
    }
    if (isNaN(quantityValue) || quantityValue < 0) {
      return Response.json({ error: 'Invalid quantity' }, { status: 400 });
    }

    const store = await prisma.store.findUnique({
      where: { Id: storeId },
    });

    if (!store) {
      return Response.json({ error: 'Store not found' }, { status: 400 });
    }

    const product = await prisma.product.create({
      data: {
        Id: Date.now().toString(),
        StoreId: storeId,
        Name: name,
        Category: category,
        Price: priceValue,
        Quantity: quantityValue,
        Note: note,
        InventoryLogs: {
          create: {
            Id: `LOG-NEW-${Date.now()}`,
            StoreId: storeId,
            Quantity: quantityValue,
            Type: 'restock',
            Note: logNote || 'Khởi tạo sản phẩm'
          }
        }
      },
    });

    // map trả về
    return Response.json({
      id: product.Id,
      storeId: product.StoreId,
      name: product.Name,
      category: product.Category,
      price: Number(product.Price),
      quantity: quantityValue,
      note: product.Note,
      createdAt: product.CreatedAt,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}

// PUT
export async function PUT(request: Request) {
  try {
    const { id, name, category, price, quantity, note, logNote, isRelative } = await request.json();

    if (!id) {
      return Response.json({ error: 'Product ID is required' }, { status: 400 });
    }

    // Lấy thông tin sản phẩm hiện tại để tính toán số lượng nhập thêm
    const currentProduct = await prisma.product.findUnique({
      where: { Id: id }
    });

    if (!currentProduct) {
      return Response.json({ error: 'Product not found' }, { status: 404 });
    }

    if (!validCategories.includes(category)) {
      return Response.json({ error: 'Invalid category' }, { status: 400 });
    }

    const priceValue = Number(price);
    const inputQty = Number(quantity);
    const addedQuantity = isRelative ? inputQty : (inputQty - currentProduct.Quantity);

    if (priceValue < 0 || isNaN(priceValue)) {
      return Response.json({ error: 'Invalid price' }, { status: 400 });
    }

    const updated = await prisma.product.update({
      where: { Id: id },
      data: {
        Name: name,
        Category: category as ProductCategory,
        Price: priceValue,
        Quantity: isRelative ? { increment: inputQty } : inputQty,
        Note: note,
        // Chỉ tạo log nếu có sự thay đổi về số lượng (Casing fix)
        InventoryLogs: addedQuantity !== 0 ? {
          create: {
            Id: `LOG-UP-${Date.now()}`,
            StoreId: currentProduct.StoreId,
            Quantity: addedQuantity,
            Type: addedQuantity > 0 ? 'restock' : 'adjustment',
            Note: logNote || (addedQuantity > 0 ? 'Nhập thêm hàng' : 'Điều chỉnh kho')
          }
        } : undefined
      },
    });

    // Cập nhật giá và tên trong giỏ hàng của các session chưa hoàn thành
    const updates: any = {};
    if (priceValue !== Number(currentProduct.Price)) {
      updates.Price = priceValue;
    }
    if (name !== currentProduct.Name) {
      updates.ProductName = name;
    }
    if (Object.keys(updates).length > 0) {
      await prisma.orderItem.updateMany({
        where: {
          ProductId: id,
          Price: Number(currentProduct.Price),
          RoomSession: {
            Status: {
              not: 'completed'
            }
          }
        },
        data: updates
      });
    }

    return Response.json({
      id: updated.Id,
      storeId: updated.StoreId,
      name: updated.Name,
      category: updated.Category,
      price: Number(updated.Price),
      quantity: updated.Quantity,
      note: updated.Note,
      createdAt: updated.CreatedAt,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}

// DELETE
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return Response.json({ error: 'Product ID is required' }, { status: 400 });
    }

    await prisma.product.delete({
      where: { Id: id },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}