# Промт для создания трекера финансов

Создай полноценное веб-приложение «Трекер финансов» — мобильный-first трекер доходов и расходов для российского малого бизнеса (ИП/самозанятые). Язык интерфейса — русский.

## Стек технологий

- **Next.js 16** (App Router, Turbopack)
- **React 19** + TypeScript
- **Prisma** + **SQLite** (база в `db/custom.db`)
- **Tailwind CSS v4** (через `@tailwindcss/postcss`)
- **shadcn/ui** (только: dialog, alert-dialog, button, input, tabs, separator)
- **Lucide React** — иконки
- **Sonner** — toast-уведомления
- **date-fns** — работа с датами

## Дизайн-система: Liquid Glass

Полный glassmorphism-дизайн с тёмной и светлой темой. Все карточки, кнопки, навбар, диалоги имеют полупрозрачный стеклянный эффект с `backdrop-filter: blur()`, градиентами и внутренними свечениями.

### Цветовая палитра

**Светлая тема** (`:root`):
- Фон: `#f0f2f7`
- Текст: `#1a1a2e`
- Карточки: `rgba(255,255,255,0.7)`
- Primary: `#3B82F6`
- Доходы: `#10B981`, фон `rgba(16,185,129,0.1)`
- Расходы: `#EF4444`, фон `rgba(239,68,68,0.1)`

**Тёмная тема** (`.dark`):
- Фон: `#0a0a12`
- Текст: `#ffffff`
- Карточки: `rgba(255,255,255,0.04)`
- Primary: `#3B82F6`
- Доходы: `#34D399`, фон `rgba(52,211,153,0.12)`
- Расходы: `#F87171`, фон `rgba(248,113,113,0.12)`

### CSS-классы Liquid Glass

1. **`.liquid-glass`** — основные карточки: фон `linear-gradient(135deg, rgba(255,255,255,0.6), rgba(255,255,255,0.3))`, blur 20px, border-radius 20px, внутреннее свечение `inset 0 1px 0 rgba(255,255,255,0.6)`. Тёмная тема: `rgba(255,255,255,0.06/0.02)`.
2. **`.liquid-glass-sm`** — маленькие кнопки: blur 16px, border-radius 14px, при `:active` масштаб `0.97`.
3. **`.liquid-glass-btn`** — основная синяя кнопка: градиент `#3B82F6 → #2563EB`, свечение `rgba(59,130,246,0.25)`.
4. **`.liquid-glass-hero`** — карточка баланса: blur 24px, border-radius 24px, с синим+фиолетовым градиентом.
5. **`.liquid-glass-green`** — карточка доходов: зелёный градиент, blur 20px.
6. **`.liquid-glass-red`** — карточка расходов: красный градиент, blur 20px.
7. **`.liquid-glass-blue`** — карточка расчётов: синий градиент.
8. **`.liquid-glass-input`** — поля ввода: `rgba(255,255,255,0.5)`, blur 12px, border-radius 16px, при фокусе синяя подсветка `0 0 0 3px rgba(59,130,246,0.1)`.
9. **`.liquid-glass-dialog`** — диалоги: blur 40px, `rgba(255,255,255,0.85)`, border-radius задаётся через className.
10. **`.nav-bar`** — фиксированная навигация: `position: fixed`, blur 24px, border-radius 20px, с отступами `top:12px left:12px right:12px`.
11. **`.transaction-row`** — строка транзакции с hover-эффектом.
12. **`.section-divider`** — градиентный разделитель.
13. **`.bg-ambient`** — анимированный фон с двумя плавающими градиентными пятнами (синее и фиолетовое), keyframe-анимация 20s/25s.
14. **`.animate-fade-in-up`** — входная анимация: opacity 0→1, translateY 12px→0.
15. **`.text-gradient-blue`** — градиентный текст `#3B82F6 → #8B5CF6`.
16. Кастомный скроллбар 4px, safe-area для мобильных.

## База данных (Prisma + SQLite)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Transaction {
  id          String   @id @default(cuid())
  type        String   // "income" или "expense"
  amount      Float    // gross amount
  taxRate     Int?     // 4 или 6 (проценты), null = нет налогового вычета
  platforms   String?  // JSON: [{"name":"Яндекс карты","reviewCount":10},...] — только для income
  description String
  category    String?  // "subscriptions", "transport", и т.д. — только для expense
  date        DateTime @default(now())
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

Файл `.env`: `DATABASE_URL=file:/home/z/my-project/db/custom.db`

`src/lib/db.ts` — Prisma-клиент с singleton-паттерном и абсолютным путём к БД:
```typescript
import { PrismaClient } from '@prisma/client'
import path from 'path'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }
const dbPath = path.join(process.cwd(), 'db', 'custom.db')

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    datasourceUrl: `file:${dbPath}`,
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
```

## API Routes

### GET `/api/transactions?month=6&year=2026`
Возвращает транзакции за указанный месяц, отсортированные по дате DESC. Заголовок `Cache-Control: private, max-age=10, stale-while-revalidate=30`.

### POST `/api/transactions`
Создаёт транзакцию. Валидирует: type (income/expense), amount (>0), description (обязательно), taxRate (4 или 6, только для income), platforms (JSON с name+reviewCount, только для income), category (только для expense).

### PUT `/api/transactions`
Обновляет транзакцию по id. Пересчитывает taxRate и platforms при смене типа. Валидирует существование записи.

### DELETE `/api/transactions?id=xxx`
Удаляет транзакцию по id (через query parameter).

## Структура страницы (одна страница — `src/app/page.tsx`, `'use client'`)

### Навигация (фиксированная)
- Логотип: градиентный квадрат `#3B82F6→#8B5CF6` с символом `₽` + текст «Финансы»
- Кнопка темы (Sun/Moon) — переключает тёмную/светлую тему
- Кнопка настроек (шестерёнка) — открывает диалог настроек площадок
- Кнопка добавления (плюс) — синяя, без текста, только иконка Plus

### Hero-секция
- Навигация по месяцам (стрелки ← →, название месяца, кнопка «Сегодня» если не текущий месяц)
- Карточка баланса: Liquid Glass Hero, текст «Баланс», сумма gradient-blue
- Два карточки в ряд: доходы (зелёная) и расходы (красная), с иконками ArrowUpRight/ArrowDownRight
- Если есть налоги/комиссии: под доходами строка «Гросс X · Налог Y · Исполнители Z»
- Прогресс-бар расходов от доходов (цвет зависит от процента: <70% зелёный, 70-90% оранжевый, >90% красный)

### Быстрая статистика (если есть транзакции)
- 4 StatCard в grid 2x2: макс. доход, макс. расход, средний доход, средний расход

### График активности по дням
- Столбчатая мини-диаграмма за каждый день месяца (доходы зелёные, расходы красные)
- Легенда внизу

### Категории расходов
- Список категорий с прогресс-барами и суммами, отсортированный по убыванию

### Список транзакций
- Табы: Все / Доходы / Расходы (с цветными активными состояниями)
- Группировка по датам с sticky-заголовками («Сегодня», «Вчера», «15 июня»)
- Каждая строка: иконка (зелёная/красная), описание, дата, площадки (иконки), сумма
- При hover — кнопки редактирования и удаления
- Skeleton-загрузка (5 пульсирующих строк)
- Пустое состояние: иконка кошелька + кнопка «Добавить»

### FAB-кнопка
- Фиксированная внизу справа, только на мобильных (`sm:hidden`), синяя Liquid Glass

### Диалог добавления транзакции
- Переключатель типа: Доход/Расход (жёлтая/красная подсветка)
- Поля: сумма, описание, дата
- Для доходов: налоговая ставка (Нет/4%/6%), площадки с чекбоксами и полем количества отзывов
- Для расходов: категория (Подписки, Транспорт, Еда, Офис, Маркетинг, Налоги, Обучение, Другое)
- Предпросмотр: чистая сумма, налог, комиссии исполнителей
- Кнопка «Добавить»

### Диалог редактирования — аналогичен добавлению

### Диалог удаления — AlertDialog с подтверждением

### Диалог настроек площадок
- Список всех площадок с иконками и полем цены за отзыв (₽/отзыв)
- Кнопка удаления площадки
- Форма добавления новой площадки (название + цена)

## Категории расходов

```typescript
const EXPENSE_CATEGORIES = [
  { value: 'subscriptions', label: 'Подписки', icon: '📺' },
  { value: 'transport', label: 'Транспорт', icon: '🚗' },
  { value: 'food', label: 'Еда', icon: '🍕' },
  { value: 'office', label: 'Офис', icon: '💻' },
  { value: 'marketing', label: 'Маркетинг', icon: '📢' },
  { value: 'taxes', label: 'Налоги', icon: '📋' },
  { value: 'education', label: 'Обучение', icon: '📚' },
  { value: 'other', label: 'Другое', icon: '📦' },
]
```

## Площадки по умолчанию

```typescript
const DEFAULT_PLATFORMS = [
  { name: 'Яндекс карты', fee: 50, icon: '/icons/yandex-maps.png' },
  { name: '2ГИС', fee: 25, icon: '/icons/2gis.png' },
  { name: 'Google карты', fee: 25, icon: '/icons/google-maps.png' },
  { name: 'Zoon', fee: 50, icon: '/icons/zoon.png' },
  { name: 'Яндекс Браузер', fee: 50, icon: '/icons/yandex-browser.png' },
  { name: 'Яндекс Услуги', fee: 50, icon: '/icons/yandex-uslugi.png' },
  { name: 'Flamp', fee: 25, icon: '/icons/flamp.png' },
  { name: 'Yell', fee: 25, icon: '/icons/yell.png' },
  { name: 'ВК', fee: 25, icon: '/icons/vk.png' },
  { name: 'ЦИАН', fee: 25, icon: '/icons/cian.png' },
  { name: 'Tripadvisor', fee: 25, icon: '/icons/tripadvisor.png' },
  { name: 'Restaurantguru', fee: 25, icon: '/icons/restaurantguru.png' },
  { name: 'Отзовик', fee: 100, icon: '/icons/otzovik.png' },
]
```

## Форматирование

- Валюта: `Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 })`
- Крупные суммы: «1.5 млн ₽» (>=1M), «500 тыс ₽» (>=100K)
- Даты: «Сегодня», «Вчера», или «15 июня»
- Месяцы: именительный падеж для заголовка, родительный для дат
- Чистая сумма дохода = gross − налог − комиссии исполнителей

## Ключевая логика

1. **Кэширование**: 30-секундный клиентский кэш для GET-запросов, инвалидация при CUD-операциях
2. **Переключение темы**: сохраняется в `localStorage('finance_theme')` (значения 'dark'/'light'). Класс `dark` вешается на `<html>`. Тема переключается мгновенно без мерцания благодаря `beforeInteractive` скрипту в layout.tsx
3. **Площадки**: настройки (список + цены) хранятся в `localStorage('finance_platforms')`, можно добавлять/удалять/менять цены
4. **Защита от hydration mismatch**: состояние `mounted` откладывает рендер клиент-специфичного UI (иконка темы) до после гидратации. `isDark` и `platforms` инициализируются SSR-безопасными дефолтами, а реальные значения из localStorage загружаются в `useEffect([], [])`
5. **Оптимизация**: `React.memo` для TransactionRow и PlatformIcon, `requestAnimationFrame` для scroll-обработчика, `isFetchingRef` для предотвращения параллельных запросов

## Файлы конфигурации

### `package.json` — зависимости:
```json
{
  "dependencies": {
    "@prisma/client": "^6.11.1",
    "@radix-ui/react-alert-dialog": "^1.1.14",
    "@radix-ui/react-dialog": "^1.1.14",
    "@radix-ui/react-separator": "^1.1.7",
    "@radix-ui/react-slot": "^1.2.3",
    "@radix-ui/react-tabs": "^1.1.12",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "date-fns": "^4.1.0",
    "lucide-react": "^0.525.0",
    "next": "^16.1.1",
    "prisma": "^6.11.1",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "sonner": "^2.0.6",
    "tailwind-merge": "^3.3.1",
    "tailwindcss-animate": "^1.0.7",
    "zod": "^4.0.2"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "25.9.3",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "^16.1.1",
    "tailwindcss": "^4",
    "tw-animate-css": "^1.3.5",
    "typescript": "^5"
  }
}
```

### `next.config.ts`:
```typescript
import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "standalone",
  typescript: { ignoreBuildErrors: true },
  reactStrictMode: false,
  images: { unoptimized: true },
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-dialog', '@radix-ui/react-alert-dialog', '@radix-ui/react-tooltip', '@radix-ui/react-tabs'],
  },
};
export default nextConfig;
```

### `postcss.config.mjs`:
```javascript
const config = { plugins: ["@tailwindcss/postcss"] };
export default config;
```

### `layout.tsx` — корневой лейаут:
- `lang="ru"`, `suppressHydrationWarning` на `<html>`
- Google Fonts (Inter 400/500/600/700) через `<link>` в `<head>`
- `<Script>` из `next/script` с `strategy="beforeInteractive"` внутри `<body>` для инициализации темы (читает `localStorage('finance_theme')`, добавляет класс `dark` если не 'light') — предотвращает мерцание темы
- `<Toaster>` от Sonner: position="top-center", glassmorphism-стили, 3 секунды
- Фоновый `div.bg-ambient`

## Важные детали реализации

1. **Не использовать** обычный HTML `<script>` в React-компонентах — только `<Script>` из `next/script`
2. **Не использовать** `typeof window !== 'undefined'` в `useState` инициализаторах — это вызывает hydration mismatch. Вместо этого: SSR-безопасный дефолт + `useEffect` для чтения из localStorage
3. **DELETE** запрос передаёт id через query parameter `?id=xxx`, а не через body
4. Кнопка добавления — **только иконка Plus**, без текста «Добавить»
5. Все числа в UI — `tabular-nums` для выравнивания
6. Диалоги используют `max-h-[85vh] overflow-y-auto` для длинного контента
7. Иконки площадок — PNG-файлы из `/public/icons/` (13 иконок: yandex-maps, 2gis, google-maps, zoon, yandex-browser, yandex-uslugi, flamp, yell, vk, cian, tripadvisor, restaurantguru, otzovik)
8. Логотип — `/public/logo.svg`

## Порядок создания

1. Инициализируй Next.js проект
2. Настрой Prisma + SQLite, создай схему, выполни `prisma db push` и `prisma generate`
3. Создай `src/lib/db.ts`
4. Создай API routes в `src/app/api/transactions/route.ts`
5. Создай `src/app/globals.css` со всей дизайн-системой Liquid Glass
6. Создай `src/app/layout.tsx` с темой, шрифтами, Toaster
7. Создай shadcn/ui компоненты: dialog, alert-dialog, button, input, tabs, separator
8. Создай `src/app/page.tsx` — единственная страница со всем UI
9. Создай иконки площадок в `/public/icons/` (простые PNG или сгенерируй)
10. Создай `/public/logo.svg`
11. Убедись что `next build` проходит без ошибок
