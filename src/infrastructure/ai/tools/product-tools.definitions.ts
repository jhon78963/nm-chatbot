import type { ToolDefinition } from '../../../application/ports/ai-provider.port.js';

export const TOOL_NAMES = {
  OBTENER_PRECIO_PRODUCTO: 'obtener_precio_producto',
  OBTENER_INFORMACION_PRODUCTO: 'obtener_informacion_producto',
  BUSCAR_PRODUCTOS: 'buscar_productos',
  AGREGAR_AL_CARRITO_WHATSAPP: 'agregar_al_carrito_whatsapp',
  CONSULTAR_CARRITO_WHATSAPP: 'consultar_carrito_whatsapp',
} as const;

const NOMBRE_PRODUCTO_PARAM = {
  type: 'object',
  properties: {
    nombre_producto: {
      type: 'string',
      description:
        'Nombre o descripción del producto tal como lo menciona el cliente, ' +
        'por ejemplo "polo azul" o "vestido floral". No es necesario que sea exacto.',
    },
    categoria: {
      type: 'string',
      description: 'Categoría opcional: niño, joven, señorita, adulto mayor.',
    },
  },
  required: ['nombre_producto'],
} as const;

export const OBTENER_PRECIO_PRODUCTO_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: TOOL_NAMES.OBTENER_PRECIO_PRODUCTO,
    description:
      'Consulta en el catálogo de Maritex el precio vigente de un producto (tallas, colores y stock disponible). ' +
      'Usa esta herramienta SIEMPRE que el cliente pregunte precio, costo o cuánto cuesta un producto específico. ' +
      'Nunca inventes un precio sin llamar a esta herramienta.',
    parameters: NOMBRE_PRODUCTO_PARAM,
  },
};

export const OBTENER_INFORMACION_PRODUCTO_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: TOOL_NAMES.OBTENER_INFORMACION_PRODUCTO,
    description:
      'Consulta información detallada de un producto: descripción, categoría, tallas, colores, stock y enlace a la tienda. ' +
      'Usa esta herramienta cuando el cliente pregunte por detalles, disponibilidad o características de un producto.',
    parameters: NOMBRE_PRODUCTO_PARAM,
  },
};

export const BUSCAR_PRODUCTOS_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: TOOL_NAMES.BUSCAR_PRODUCTOS,
    description:
      'Busca productos en el catálogo de Maritex por nombre o categoría. ' +
      'Usa cuando el cliente pide opciones, modelos o recomendaciones de una prenda.',
    parameters: NOMBRE_PRODUCTO_PARAM,
  },
};

const CARRITO_WHATSAPP_PARAM = {
  type: 'object',
  properties: {
    nombre_producto: {
      type: 'string',
      description: 'Nombre del producto que el cliente quiere reservar en su carrito WhatsApp.',
    },
    categoria: {
      type: 'string',
      description: 'Categoría opcional: niño, joven, señorita, adulto mayor.',
    },
    talla: {
      type: 'string',
      description: 'Talla indicada por el cliente (ej. M, 8, 32). Opcional si hay una sola variante.',
    },
    cantidad: {
      type: 'number',
      description: 'Cantidad a agregar. Default 1.',
    },
  },
  required: ['nombre_producto'],
} as const;

export const AGREGAR_AL_CARRITO_WHATSAPP_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: TOOL_NAMES.AGREGAR_AL_CARRITO_WHATSAPP,
    description:
      'Guarda un producto en el carrito temporal del cliente en WhatsApp (válido 24 h). ' +
      'Úsala cuando el cliente confirme que quiere un producto (ej. "me llevo el polo azul talla M", "agrégalo al carrito"). ' +
      'Primero verifica nombre/talla con catálogo si hace falta; no inventes productos.',
    parameters: CARRITO_WHATSAPP_PARAM,
  },
};

export const CONSULTAR_CARRITO_WHATSAPP_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: TOOL_NAMES.CONSULTAR_CARRITO_WHATSAPP,
    description:
      'Consulta cuántos productos lleva el cliente en su carrito WhatsApp y el total referencial. ' +
      'Úsala cuando pregunte qué tiene en el carrito o antes de ofrecer cerrar el pedido.',
    parameters: { type: 'object', properties: {} },
  },
};

export const PRODUCT_TOOLS: ToolDefinition[] = [
  OBTENER_PRECIO_PRODUCTO_TOOL,
  OBTENER_INFORMACION_PRODUCTO_TOOL,
  BUSCAR_PRODUCTOS_TOOL,
  AGREGAR_AL_CARRITO_WHATSAPP_TOOL,
  CONSULTAR_CARRITO_WHATSAPP_TOOL,
];
