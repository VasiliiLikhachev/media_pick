# Media Picker

PR-инструмент для AI-подборки медиа, конкурсов, научных площадок и ассоциаций.

## Стек

- Next.js 14 (App Router)
- Supabase (PostgreSQL)
- Anthropic Claude claude-sonnet-4-20250514
- Vercel (деплой)

## Как работает

1. Пользователь вводит задание + тип площадки + топ N
2. Claude извлекает ключевые слова из задания
3. SQL-запрос к Supabase: `ILIKE` по 9 смысловым полям
4. Claude ранжирует кандидатов → генерирует `причина_выбора` и `тематика`
5. Таблица с результатами + экспорт в CSV

## Локальный запуск

```bash
npm install
cp .env.example .env.local
# Заполни .env.local своими ключами
npm run dev
```

## Деплой на Vercel

1. Создай новый проект на [vercel.com](https://vercel.com)
2. Подключи git-репозиторий
3. Добавь переменные окружения в Settings → Environment Variables:

| Переменная | Значение |
|---|---|
| `SUPABASE_URL` | `https://scgozdwdqkehwaocoiup.supabase.co` |
| `SUPABASE_ANON_KEY` | anon key из Supabase → Settings → API |
| `ANTHROPIC_API_KEY` | ключ из console.anthropic.com |

4. Deploy

## Структура Supabase

Таблица `media_base`, ~4600 строк, 40 колонок.

Ключевые поля для поиска (ILIKE):
- `description`, `topic`, `Для кого`, `Для кого / есть ли органичения?`
- `Категории или кластеры`, `Номинации`
- `Описание SimilarWeb`, `Описание generated`, `Отрасли`

Фильтр по `entity_type`: СМИ / Конкурс / Научные статьи / Ассоциация

## Timeout

API-роут настроен на 60 сек (Vercel Pro / максимум Free — 10 сек).  
Если используешь Free план — рассмотри Vercel Hobby → Pro или разбей на два запроса.
