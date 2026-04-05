import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'
import { MediaRow, ResultRow, SearchParams } from '@/lib/types'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// Step 1: Extract keywords from task using Claude
async function extractKeywords(task: string): Promise<string[]> {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Извлеки 5-10 ключевых слов и фраз из следующего PR-задания для поиска подходящих медиа. 
Верни ТОЛЬКО JSON массив строк, без пояснений.
Слова должны быть релевантны тематике, отрасли, аудитории.

Задание: ${task}

Пример ответа: ["технологии", "стартап", "инвестиции", "IT", "digital"]`
    }]
  })
  
  const text = msg.content[0].type === 'text' ? msg.content[0].text : '[]'
  try {
    const clean = text.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch {
    // fallback: split task into words
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
    'Отрасли'
  ]

  // Build OR conditions for ILIKE across all fields and keywords
  const orConditions: string[] = []
  for (const field of semanticFields) {
    for (const kw of keywords) {
      orConditions.push(`"${field}".ilike.%${kw}%`)
    }
  }

  let query = getSupabase()
    .from('media_base')
    .select('*')
    .limit(300)

  // Filter by entity types if specified
  if (entityTypes.length > 0) {
    query = query.in('entity_type', entityTypes)
  }

  // Apply OR filter
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

  // Prepare compact candidate list for Claude
  const candidateList = candidates.map((row, idx) => ({
    idx,
    name: row['Название'] || '',
    type: row['entity_type'] || '',
    description: row['description'] || row['Описание generated'] || '',
    topics: row['topic'] || '',
    industries: row['Отрасли'] || '',
    audience: row['Для кого'] || '',
    categories: row['Категории или кластеры'] || '',
    nominations: row['Номинации'] || '',
    drawbacks: row['Недостатки издания'] || '',
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

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }]
  })

  const text = msg.content[0].type === 'text' ? msg.content[0].text : '[]'
  
  let rankings: Array<{ idx: number; причина_выбора: string; тематика: string }> = []
  try {
    const clean = text.replace(/```json|```/g, '').trim()
    rankings = JSON.parse(clean)
  } catch (e) {
    console.error('Failed to parse Claude response:', text)
    throw new Error('Claude вернул невалидный JSON')
  }

  // Map rankings back to full rows
  return rankings.map((r, position) => {
    const row = candidates[r.idx]
    if (!row) return null

    const subtype = row['Подтип'] || row['подтип.1'] || ''
    
    return {
      Критерий: String(position + 1),
      Название: row['Название'] || '',
      Ссылка: row['Ссылка'] || '',
      'Цена из базы': row['Цена'] || '',
      Валюта: row['Валюта'] || '',
      'Причина выбора': r.причина_выбора || '',
      Тематика: r.тематика || '',
      'Из какой базы': row['Из какой базы'] || '',
      Подтип: subtype,
      Трафик: row['Трафик'] || '',
      'Тип публикации': row['Тип публикации'] || '',
      'Дата проведения': row['Крайняя дата подачи'] || '',
      'Формы участия': row['Доступные формы участия'] || '',
      'Индексирование и архивирование': row['Индексирование и архивирование'] || '',
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

    // Step 1: Extract keywords
    const keywords = await extractKeywords(task)
    
    // Step 2: Fetch candidates from Supabase
    const candidates = await fetchCandidates(keywords, entityTypes)
    
    if (candidates.length === 0) {
      return NextResponse.json({ 
        results: [],
        meta: { keywords, candidatesFound: 0 }
      })
    }

    // Step 3: Rank with Claude
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
