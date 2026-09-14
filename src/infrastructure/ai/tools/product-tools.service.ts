import { getPrismaClient } from '../../database/prisma/prisma.client.js';
import { buildProductUrl } from '../../../shared/product-slug.util.js';
import type { EcommerceGuestCartClient } from '../../http/ecommerce-guest-cart.client.js';
import { TOOL_NAMES } from './product-tools.definitions.js';
import { logger } from '../../shared/logger.js';

interface ToolArgs {
  nombre_producto?: unknown;
  categoria?: unknown;
  talla?: unknown;
  cantidad?: unknown;
}

function dbErrorPayload(context: string): string {
  return JSON.stringify({
    ok: false,
    error: 'DB_UNAVAILABLE',
    mensaje:
      'No fue posible consultar el catálogo en este momento. No inventes datos. ' +
      'Informa al cliente que hay un inconveniente técnico temporal y ofrece derivarlo con un asesor.',
    context,
  });
}

function productNotFoundPayload(nombre: string): string {
  return JSON.stringify({
    ok: false,
    error: 'PRODUCT_NOT_FOUND',
    mensaje: `No se encontró un producto activo que coincida con "${nombre}". ` +
      'No inventes precios ni tallas. Pide al cliente más detalle o ofrece ver el catálogo en la tienda.',
  });
}

function getStoreUrl(): string {
  return (process.env['STORE_URL'] ?? 'https://novedadesmaritex.net.pe').replace(/\/$/, '');
}

function productUrl(product: { id: string; name: string }): string {
  return buildProductUrl(getStoreUrl(), product);
}

function formatPrice(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Executes catalog tools against PostgreSQL (products, genders, sizes, inventory).
 */
type ProductCatalogRow = Awaited<
  ReturnType<ProductToolsService['findProductsForTool']>
>[number];

export class ProductToolsService {
  private cartCustomerPhone: string | null = null;

  constructor(private readonly guestCartClient?: EcommerceGuestCartClient) {}

  setCartContext(customerPhone: string | null): void {
    this.cartCustomerPhone = customerPhone?.trim() ? customerPhone.trim() : null;
  }

  clearCartContext(): void {
    this.cartCustomerPhone = null;
  }

  private parseArgs(rawArguments: string): ToolArgs {
    try {
      const parsed = JSON.parse(rawArguments) as unknown;
      return parsed && typeof parsed === 'object' ? (parsed as ToolArgs) : {};
    } catch {
      return {};
    }
  }

  private extractProductName(rawArguments: string): string | null {
    const { nombre_producto } = this.parseArgs(rawArguments);
    return typeof nombre_producto === 'string' && nombre_producto.trim()
      ? nombre_producto.trim()
      : null;
  }

  async execute(toolName: string, rawArguments: string): Promise<string> {
    switch (toolName) {
      case TOOL_NAMES.OBTENER_PRECIO_PRODUCTO:
        return this.obtenerPrecioProducto(rawArguments);
      case TOOL_NAMES.OBTENER_INFORMACION_PRODUCTO:
        return this.obtenerInformacionProducto(rawArguments);
      case TOOL_NAMES.BUSCAR_PRODUCTOS:
        return this.buscarProductos(rawArguments);
      case TOOL_NAMES.AGREGAR_AL_CARRITO_WHATSAPP:
        return this.agregarAlCarritoWhatsapp(rawArguments);
      case TOOL_NAMES.CONSULTAR_CARRITO_WHATSAPP:
        return this.consultarCarritoWhatsapp();
      default:
        logger.warn('[ProductTools] Unknown tool requested', { toolName });
        return JSON.stringify({
          ok: false,
          error: 'UNKNOWN_TOOL',
          mensaje: `La herramienta "${toolName}" no existe en este sistema.`,
        });
    }
  }

  private async findProductsForTool(nombre: string, categoria?: string) {
    const prisma = getPrismaClient();
    const genderFilter = categoria
      ? {
          gender: {
            name: { contains: categoria, mode: 'insensitive' as const },
          },
        }
      : {};

    return prisma.product.findMany({
      where: {
        isDeleted: false,
        status: { in: ['active', 'AVAILABLE'] },
        name: { contains: nombre, mode: 'insensitive' },
        ...genderFilter,
      },
      include: {
        gender: { select: { name: true } },
        productSizes: {
          where: { isDeleted: false },
          include: {
            size: { select: { description: true } },
            inventoryBalances: { select: { quantity: true } },
          },
        },
        media: {
          orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }],
          take: 1,
          select: { url: true },
        },
      },
      take: 5,
    });
  }

  private mapSizes(product: ProductCatalogRow) {
    return product.productSizes.map((ps) => {
      const stock = ps.inventoryBalances.reduce(
        (sum: number, b: { quantity: number }) => sum + b.quantity,
        0,
      );
      return {
        talla: ps.size.description,
        precio: formatPrice(ps.salePrice),
        stock,
        disponible: stock > 0,
      };
    });
  }

  async obtenerPrecioProducto(rawArguments: string): Promise<string> {
    const nombre = this.extractProductName(rawArguments);
    if (!nombre) {
      return JSON.stringify({
        ok: false,
        error: 'MISSING_ARGUMENT',
        mensaje: 'Falta el nombre del producto para consultar el precio.',
      });
    }

    const { categoria } = this.parseArgs(rawArguments);
    const categoriaStr = typeof categoria === 'string' ? categoria : undefined;

    try {
      const products = await this.findProductsForTool(nombre, categoriaStr);
      if (products.length === 0) return productNotFoundPayload(nombre);

      const product = products[0]!;
      const tallas = this.mapSizes(product);
      const precios = tallas.map((t: { precio: number | null }) => t.precio).filter((p: number | null): p is number => p !== null);
      const minPrecio = precios.length > 0 ? Math.min(...precios) : null;
      const maxPrecio = precios.length > 0 ? Math.max(...precios) : null;

      return JSON.stringify({
        ok: true,
        encontrado: true,
        producto: product.name,
        categoria: product.gender.name,
        precioMinimo: minPrecio,
        precioMaximo: maxPrecio,
        moneda: 'PEN',
        tallas,
        urlTienda: productUrl(product),
        mensaje:
          minPrecio === null
            ? 'Producto encontrado pero sin precio registrado; un asesor puede confirmar.'
            : undefined,
      });
    } catch (err) {
      logger.error('[ProductTools] obtener_precio_producto failed', {
        nombre,
        error: err instanceof Error ? err.message : String(err),
      });
      return dbErrorPayload('product_price_lookup');
    }
  }

  async obtenerInformacionProducto(rawArguments: string): Promise<string> {
    const nombre = this.extractProductName(rawArguments);
    if (!nombre) {
      return JSON.stringify({
        ok: false,
        error: 'MISSING_ARGUMENT',
        mensaje: 'Falta el nombre del producto para consultar su información.',
      });
    }

    const { categoria } = this.parseArgs(rawArguments);
    const categoriaStr = typeof categoria === 'string' ? categoria : undefined;

    try {
      const products = await this.findProductsForTool(nombre, categoriaStr);
      if (products.length === 0) return productNotFoundPayload(nombre);

      const product = products[0]!;
      const tallas = this.mapSizes(product);
      const enStock = tallas.some((t: { disponible: boolean }) => t.disponible);

      return JSON.stringify({
        ok: true,
        encontrado: true,
        producto: product.name,
        categoria: product.gender.name,
        descripcion: product.shortDescription ?? product.description ?? null,
        tallas,
        disponible: enStock,
        destacado: product.isFeatured,
        enOferta: product.isOnSale,
        descuento: product.percentageDiscount ?? null,
        imagen: product.media[0]?.url ?? null,
        urlTienda: productUrl(product),
        tienda: getStoreUrl(),
      });
    } catch (err) {
      logger.error('[ProductTools] obtener_informacion_producto failed', {
        nombre,
        error: err instanceof Error ? err.message : String(err),
      });
      return dbErrorPayload('product_info_lookup');
    }
  }

  async buscarProductos(rawArguments: string): Promise<string> {
    const nombre = this.extractProductName(rawArguments);
    if (!nombre) {
      return JSON.stringify({
        ok: false,
        error: 'MISSING_ARGUMENT',
        mensaje: 'Indica qué producto o estilo busca el cliente.',
      });
    }

    const { categoria } = this.parseArgs(rawArguments);
    const categoriaStr = typeof categoria === 'string' ? categoria : undefined;

    try {
      const products = await this.findProductsForTool(nombre, categoriaStr);
      if (products.length === 0) {
        return JSON.stringify({
          ok: true,
          encontrado: false,
          mensaje: `No hay productos activos que coincidan con "${nombre}". Sugiere explorar ${getStoreUrl()}.`,
        });
      }

      return JSON.stringify({
        ok: true,
        encontrado: true,
        resultados: products.map((p) => ({
          id: p.id,
          nombre: p.name,
          categoria: p.gender.name,
          precioReferencial: formatPrice(
            p.productSizes.find((s: { isDeleted: boolean }) => !s.isDeleted)?.salePrice ?? null,
          ),
          url: productUrl(p),
        })),
        tienda: getStoreUrl(),
      });
    } catch (err) {
      logger.error('[ProductTools] buscar_productos failed', {
        nombre,
        error: err instanceof Error ? err.message : String(err),
      });
      return dbErrorPayload('product_search');
    }
  }

  private resolveProductSize(
    product: ProductCatalogRow,
    tallaHint?: string,
  ): { productSizeId: string; variation: string; unitPrice: number } | null {
    const sizes = product.productSizes.filter((ps) => !ps.isDeleted);
    if (sizes.length === 0) {
      return null;
    }

    let chosen = sizes[0]!;
    if (tallaHint) {
      const normalized = tallaHint.trim().toLowerCase();
      const match = sizes.find(
        (ps) => ps.size.description.trim().toLowerCase() === normalized,
      );
      if (match) {
        chosen = match;
      } else if (sizes.length > 1) {
        return null;
      }
    } else if (sizes.length > 1) {
      return null;
    }

    const unitPrice = formatPrice(chosen.salePrice) ?? 0;
    return {
      productSizeId: chosen.id,
      variation: chosen.size.description,
      unitPrice,
    };
  }

  async agregarAlCarritoWhatsapp(rawArguments: string): Promise<string> {
    const nombre = this.extractProductName(rawArguments);
    if (!nombre) {
      return JSON.stringify({
        ok: false,
        error: 'MISSING_ARGUMENT',
        mensaje: 'Indica qué producto debe agregarse al carrito.',
      });
    }

    if (!this.guestCartClient?.enabled || !this.cartCustomerPhone) {
      return JSON.stringify({
        ok: false,
        error: 'CART_UNAVAILABLE',
        mensaje:
          'El carrito WhatsApp no está disponible ahora. Ofrece el enlace del producto en la tienda o HANDOFF_TRIGGER si quiere comprar ya.',
      });
    }

    const { categoria, talla, cantidad } = this.parseArgs(rawArguments);
    const categoriaStr = typeof categoria === 'string' ? categoria : undefined;
    const tallaStr = typeof talla === 'string' ? talla : undefined;
    const qtyRaw = typeof cantidad === 'number' ? cantidad : Number(cantidad);
    const quantity = Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.floor(qtyRaw) : 1;

    try {
      const products = await this.findProductsForTool(nombre, categoriaStr);
      if (products.length === 0) {
        return productNotFoundPayload(nombre);
      }

      const product = products[0]!;
      const resolvedSize = this.resolveProductSize(product, tallaStr);
      if (!resolvedSize) {
        const tallas = product.productSizes
          .filter((ps) => !ps.isDeleted)
          .map((ps) => ps.size.description);
        return JSON.stringify({
          ok: false,
          error: 'SIZE_REQUIRED',
          mensaje: `Indica la talla para "${product.name}". Opciones: ${tallas.join(', ')}.`,
          tallasDisponibles: tallas,
        });
      }

      const productIdPrefix = product.id.replace(/-/g, '').slice(0, 8).toLowerCase();
      const upsert = await this.guestCartClient.upsertCart({
        customerPhone: this.cartCustomerPhone,
        source: 'bot',
        items: [
          {
            productId: product.id,
            productSizeId: resolvedSize.productSizeId,
            productIdPrefix,
            ...(product.barcode ? { sku: product.barcode } : {}),
            name: product.name,
            variation: resolvedSize.variation,
            productUrl: productUrl(product),
            quantity,
            unitPrice: resolvedSize.unitPrice,
          },
        ],
      });

      if (!upsert?.cart) {
        return JSON.stringify({
          ok: false,
          error: 'CART_WRITE_FAILED',
          mensaje: 'No pude guardar el carrito. Ofrece derivación con un asesor.',
        });
      }

      return JSON.stringify({
        ok: true,
        agregado: true,
        producto: product.name,
        talla: resolvedSize.variation,
        cantidad: quantity,
        itemCount: upsert.cart.itemCount,
        totalReferencial: upsert.cart.total,
        moneda: 'PEN',
        mensaje:
          `Producto guardado. El cliente lleva ${upsert.cart.itemCount} ítem(s) en el carrito. ` +
          'Confirma al cliente y pregunta si desea agregar algo más o armar el pedido con un asesor.',
      });
    } catch (err) {
      logger.error('[ProductTools] agregar_al_carrito_whatsapp failed', {
        nombre,
        error: err instanceof Error ? err.message : String(err),
      });
      return dbErrorPayload('whatsapp_cart_add');
    }
  }

  async consultarCarritoWhatsapp(): Promise<string> {
    if (!this.guestCartClient?.enabled || !this.cartCustomerPhone) {
      return JSON.stringify({
        ok: false,
        error: 'CART_UNAVAILABLE',
        mensaje: 'Carrito WhatsApp no disponible.',
      });
    }

    try {
      const result = await this.guestCartClient.getHandoff({ customerPhone: this.cartCustomerPhone });
      const cart = result?.cart;
      if (!cart || cart.itemCount <= 0) {
        return JSON.stringify({
          ok: true,
          vacio: true,
          mensaje: 'El carrito está vacío. Sugiere buscar productos o compartir enlaces de la tienda.',
        });
      }

      return JSON.stringify({
        ok: true,
        itemCount: cart.itemCount,
        totalReferencial: cart.total,
        moneda: cart.currency,
        productos: cart.items.map((item) => ({
          nombre: item.name,
          cantidad: item.quantity,
          talla: item.variation ?? null,
          subtotal: item.lineTotal,
        })),
        mensaje:
          `Tiene ${cart.itemCount} producto(s) por S/ ${cart.total.toFixed(2)} referencial. ` +
          'Pregunta si desea agregar más o armar el pedido (derivar asesor solo si confirma compra).',
      });
    } catch (err) {
      logger.error('[ProductTools] consultar_carrito_whatsapp failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return dbErrorPayload('whatsapp_cart_read');
    }
  }
}
