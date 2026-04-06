import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'
import { MediaRow, ResultRow, SearchParams } from '@/lib/types'

function getAnthropic() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
  })
}

// Step 1: Extract keywords from task using Claude
async function extractKeywords(task: string): Promise<string[]> {
  const msg = await getAnthropic().messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Извлеки 8-12 ключевых слов и фраз из следующего PR-задания для поиска подходящих медиа.
Верни ТОЛЬКО JSON массив строк, без пояснений.
Слова должны быть короткими (1-2 слова), релевантны тематике, отрасли, аудитории.
Включай как русские так и английские варианты ключевых слов если применимо.

Задание: ${task}

Пример ответа: ["финтех", "банк", "технологии", "fintech", "IT", "инвестиции"]`
    }]
  })

  const text = msg.content[0].type === 'text' ? msg.content[0].text : '[]'
  try {
    const clean = text.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch {
    return task.split(/\s+/).filter(w => w.length > 3).slice(0, 8)
  }
}

// Step 2: Query Supabase with ILIKE across semantic fields
async function fetchCandidates(keywords: string[], entityTypes: string[]): Promise<MediaRow[]> {
  const semanticFields = [
    'description',
    'topic',
    'Для кого',
    'Для кого / есть ли органичения?',
    'Категории или кластеры',
    'Номинации',
    'Описание SimilarWeb',
    'Описание generated',
    'Отрасли',
    'Specifics',
    'name',
    'region',
  ]

  // Build OR conditions for ILIKE
  const orConditions: string[] = []
  for (const field of semanticFields) {
    for (const kw of keywords) {
      orConditions.push(`"${field}".ilike.%${kw}%`)
    }
  }

  let query = getSupabase()
    .from('media_base')
    .select('*')
    .limit(400)

  if (entityTypes.length > 0) {
    query = query.in('entity_type', entityTypes)
  }

  if (orConditions.length > 0) {
    query = query.or(orConditions.join(','))
  }

  const { data, error } = await query

  if (error) {
    console.error('Supabase error:', error)
    throw new Error(`Supabase query failed: ${error.message}`)
  }

  return (data || []) as MediaRow[]
}

// Step 3: Claude ranks candidates and generates причина_выбора + тематика
async function rankCandidates(
  task: string,
  candidates: MediaRow[],
  topN: number
): Promise<ResultRow[]> {
  if (candidates.length === 0) return []

  // Limit to 60 candidates max to stay within Claude context
  const limited = candidates.slice(0, 60)

  const trim = (s: string | null | undefined, len = 120) =>
    s ? s.slice(0, len) : ''

  const candidateList = limited.map((row, idx) => ({
    idx,
    name: row.name || '',
    type: row.entity_type || '',
    description: trim(row.description || row['Описание generated'], 150),
    topics: trim(row.topic, 80),
    industries: trim(row['Отрасли'], 80),
    audience: trim(row['Для кого'], 80),
    categories: trim(row['Категории или кластеры'], 80),
    nominations: trim(row['Номинации'], 80),
    region: row.region || '',
    drawbacks: trim(row['Недостатки издания'], 80),
  }))

  const prompt = `Ты помощник PR-специалиста. Выбери топ-${topN} наиболее подходящих медиа/площадок для задания ниже.

ЗАДАНИЕ: ${task}

КАНДИДАТЫ (всего ${candidates.length}):
${JSON.stringify(candidateList, null, 2)}

Верни ТОЛЬКО JSON массив объектов в таком формате (без пояснений, без markdown):
[
  {
    "idx": <число — индекс из списка кандидатов>,
    "причина_выбора": "<2-3 предложения: почему это медиа подходит для задания>",
    "тематика": "<1-2 слова: основная тематика площадки>"
  }
]

Правила:
- Выбери ровно ${topN} лучших (или меньше, если кандидатов недостаточно)
- Если у кандидата есть "drawbacks" (недостатки), добавь ⚠️ в начало причины выбора с кратким упоминанием
- Оценивай релевантность задания тематике, аудитории и охвату
- Верни строго валидный JSON`

  const msg = await getAnthropic().messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }]
  })

  const text = msg.content[0].type === 'text' ? msg.content[0].text : '[]'

  let rankings: Array<{ idx: number; причина_выбора: string; тематика: string }> = []
  try {
    // Extract JSON array from response — Claude sometimes adds preamble or error text
    const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/)
    if (!jsonMatch) {
      console.error('No JSON array found in Claude response:', text.slice(0, 300))
      // Fallback: return top N candidates with generic reason
      return candidates.slice(0, topN).map((row, position) => {
        const subtype = row['Подтип'] || row['подтип.1'] || ''
        return {
          Критерий: String(position + 1),
          Название: row.name || '',
          Ссылка: row.url || '',
          'Цена из базы': row.price || '',
          Валюта: row.currency || '',
          'Причина выбора': row.description || row['Описание generated'] || 'Релевантная площадка по теме задания',
          Тематика: row.topic || '',
          'Из какой базы': row.base_name || '',
          Подтип: subtype,
          Трафик: row.traffic || '',
          'Тип публикации': row['Тип публикации'] || '',
          'Дата проведения': row['Крайняя дата подачи'] || '',
          'Формы участия': row['Доступные формы участия'] || '',
          'Индексирование и архивирование': row['Индексирование и архивирование'] || '',
          Регион: row.entity_type === 'Научные статьи' ? (row['Страны'] || '') : (row.region || ''),
        } as ResultRow
      })
    }
    rankings = JSON.parse(jsonMatch[0])
  } catch (e) {
    console.error('Failed to parse Claude response:', text.slice(0, 300))
    throw new Error('Ошибка парсинга ответа Claude: ' + (e instanceof Error ? e.message : String(e)))
  }

  return rankings.map((r, position) => {
    const row = limited[r.idx]
    if (!row) return null

    const subtype = row['Подтип'] || row['подтип.1'] || ''

    return {
      Критерий: String(position + 1),
      Название: row.name || '',
      Ссылка: row.url || '',
      'Цена из базы': row.price || '',
      Валюта: row.currency || '',
      'Причина выбора': r.причина_выбора || '',
      Тематика: r.тематика || '',
      'Из какой базы': row.base_name || '',
      Подтип: subtype,
      Трафик: row.traffic || '',
      'Тип публикации': row['Тип публикации'] || '',
      'Дата проведения': row['Крайняя дата подачи'] || '',
      'Формы участия': row['Доступные формы участия'] || '',
      'Индексирование и архивирование': row['Индексирование и архивирование'] || '',
      Регион: row.entity_type === 'Научные статьи'
        ? (row['Страны'] || '')
        : (row.region || ''),
    } as ResultRow
  }).filter(Boolean) as ResultRow[]
}

export async function POST(req: NextRequest) {
  try {
    const body: SearchParams = await req.json()
    const { task, entityTypes, topN } = body

    if (!task || task.trim().length < 5) {
      return NextResponse.json({ error: 'Задание слишком короткое' }, { status: 400 })
    }

    const keywords = await extractKeywords(task)
    const candidates = await fetchCandidates(keywords, entityTypes)

    if (candidates.length === 0) {
      return NextResponse.json({
        results: [],
        meta: { keywords, candidatesFound: 0 }
      })
    }

    const results = await rankCandidates(task, candidates, topN)

    return NextResponse.json({
      results,
      meta: {
        keywords,
        candidatesFound: candidates.length,
        topN,
      }
    })

  } catch (err: unknown) {
    console.error('Search API error:', err)
    const message = err instanceof Error ? err.message : 'Неизвестная ошибка'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
