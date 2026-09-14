import type { OutboundInteractiveListMessage } from '../ports/messaging-provider.port.js';

/** list_reply.id values for the main bot menu. */
export const MENU_ROW_IDS = {
  CATALOG: 'catalog',
  STORE: 'store',
  HANDOFF: 'handoff',
  CONTACT: 'contact',
} as const;

export type MenuSelection = (typeof MENU_ROW_IDS)[keyof typeof MENU_ROW_IDS];

/** button_reply.id values for interactive handoff confirmation. */
export const HANDOFF_BUTTON_IDS = {
  YES: 'handoff_yes',
  NO: 'handoff_no',
} as const;

const MENU_KEYWORD_PATTERN = /\b(men[uú]|menu|opciones)\b/i;

const GREETING_PATTERN =
  /^(hola|buenas|buenos\s+d[ií]as|buenas\s+tardes|buenas\s+noches|hi|hello|hey|ola|qué tal|que tal|buen\s*d[ií]a)[\s!?.]*$/i;

/** Fixed welcome message from knowledge_base.md — do not modify. */
export const NM_WELCOME_MESSAGE =
  '👋 ¡Hola! Bienvenido(a) a 𝐌𝐚𝐫𝐢𝐭𝐞𝐱 🛍️✨\n' +
  '¡Gracias por escribirnos! Tenemos ropa para toda la familia 👨‍👩‍👧‍👦\n\n' +
  'Tenemos modelos para:\n' +
  '1️⃣ Niño\n' +
  '2️⃣ Joven\n' +
  '3️⃣ Señorita\n' +
  '4️⃣ Adulto mayor\n\n' +
  '👉 Respóndenos con el número de la opción y te mostraremos los modelos disponibles, precios y tallas. 😊';

function botName(): string {
  return process.env['BOT_NAME'] ?? 'Malu';
}

function storeUrl(): string {
  return (process.env['STORE_URL'] ?? 'https://novedadesmaritex.net.pe').replace(/\/$/, '');
}

export function isGreeting(text: string): boolean {
  return GREETING_PATTERN.test(text.trim());
}

export function isMainMenuTrigger(text: string, _isFirstMessage: boolean): boolean {
  const trimmed = text.trim();
  return MENU_KEYWORD_PATTERN.test(trimmed);
}

export function getWelcomeMessage(): string {
  return NM_WELCOME_MESSAGE;
}

/** Canonical user phrases passed to the intent router per menu row. */
export const MENU_INTENT_PHRASES: Record<MenuSelection, string> = {
  [MENU_ROW_IDS.CATALOG]: 'Quiero ver el catálogo de productos de Maritex',
  [MENU_ROW_IDS.STORE]: 'Quiero ir a la tienda online de Maritex',
  [MENU_ROW_IDS.HANDOFF]: 'Quiero hablar con un asesor',
  [MENU_ROW_IDS.CONTACT]: '¿Cómo puedo contactar a Maritex?',
};

export function parseMenuSelection(interactiveReplyId: string | undefined): MenuSelection | null {
  if (!interactiveReplyId) return null;
  const ids = Object.values(MENU_ROW_IDS) as string[];
  return ids.includes(interactiveReplyId) ? (interactiveReplyId as MenuSelection) : null;
}

/** Welcome-menu digit replies (1–4) — fixed copy from knowledge_base.md. */
const CATEGORY_DIGIT_RESPONSES: Record<'1' | '2' | '3' | '4', string> = {
  '1':
    '¡Genial! 🧒 Aquí tienes nuestra ropa para niños 👇\n\n' +
    'Puedes ver todos los modelos disponibles, precios y tallas aquí:\n' +
    '👉 https://novedadesmaritex.net.pe/ninos\n\n' +
    'Tenemos desde bebé hasta talla 14, con diseños súper lindos 🎀\n\n' +
    '¿Tienes en mente alguna prenda específica? Cuéntame la edad del niño/niña y te ayudo mejor 😊',
  '2':
    '¡Buena elección! 🔥 Tenemos ropa juvenil con los mejores estilos 👇\n\n' +
    'Explora todos los modelos aquí:\n' +
    '👉 https://novedadesmaritex.net.pe/jovenes\n\n' +
    'Polos, pantalones, casacas, buzos y más, con los colores y diseños de moda 😎\n\n' +
    '¿Buscas algo en especial? Cuéntame y te muestro opciones ✨',
  '3':
    '¡Perfecto! 👗 Tenemos una colección increíble para señoritas y damas 👇\n\n' +
    'Mira todos los modelos disponibles aquí:\n' +
    '👉 https://novedadesmaritex.net.pe/senoritas\n\n' +
    'Blusas, vestidos, pantalones, tops, conjuntos y mucho más, en las tallas y colores que buscas 💃\n\n' +
    '¿Tienes en mente alguna prenda? Con gusto te ayudo a encontrar la ideal 🌟',
  '4':
    '¡Excelente! 👔 Tenemos ropa cómoda y con estilo para adultos 👇\n\n' +
    'Revisa todos los modelos aquí:\n' +
    '👉 https://novedadesmaritex.net.pe/adulto-mayor\n\n' +
    'Prendas pensadas para tu comodidad, con tallas amplias y diseños clásicos 👍\n\n' +
    '¿Qué tipo de prenda buscas? Con gusto te oriento 😊',
};

export function parseCategoryDigitSelection(text: string): '1' | '2' | '3' | '4' | null {
  const m = text.trim().match(/^([1-4])\s*$/);
  return m ? (m[1] as '1' | '2' | '3' | '4') : null;
}

export function getCategoryDigitResponse(digit: '1' | '2' | '3' | '4'): string {
  return CATEGORY_DIGIT_RESPONSES[digit];
}

export function buildMainMenuList(to: string): OutboundInteractiveListMessage {
  const name = botName();
  return {
    to,
    body: `¡Hola! Soy ${name} de Maritex. ¿En qué puedo ayudarte hoy?`,
    buttonText: 'Ver opciones',
    sections: [
      {
        title: 'Menú principal',
        rows: [
          {
            id: MENU_ROW_IDS.CATALOG,
            title: 'Ver catálogo',
            description: 'Productos y categorías',
          },
          {
            id: MENU_ROW_IDS.STORE,
            title: 'Tienda online',
            description: 'novedadesmaritex.net.pe',
          },
          {
            id: MENU_ROW_IDS.HANDOFF,
            title: 'Hablar con asesor',
            description: 'Atención personalizada',
          },
          {
            id: MENU_ROW_IDS.CONTACT,
            title: 'Contacto',
            description: 'Soporte y tiendas',
          },
        ],
      },
    ],
  };
}

export function getCampusLocationFromEnv(): {
  latitude: number;
  longitude: number;
  name: string;
  address: string;
} {
  return {
    latitude: Number(process.env['LOCATION_LATITUDE'] ?? -8.1116),
    longitude: Number(process.env['LOCATION_LONGITUDE'] ?? -79.0285),
    name: process.env['LOCATION_NAME'] ?? 'Novedades Maritex',
    address: process.env['LOCATION_ADDRESS'] ?? 'Trujillo, Perú — consulta tiendas en la web',
  };
}

export function getStoreLinkMessage(): string {
  return `Visita nuestra tienda online:\n👉 ${storeUrl()}`;
}

export function isInteractiveHandoffEnabled(): boolean {
  return process.env['INTERACTIVE_HANDOFF'] === 'true';
}
