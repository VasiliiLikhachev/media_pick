import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { MediaRow, ResultRow } from '@/lib/types'

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
}

const trim = (s: string | null | undefined, len = 120) => s ? s.slice(0, len) : ''

export async function POST(req: NextRequest) {
  try {
    const { task, candidates, topN, region } = await req.json()

    if (!candidates?.length) {
      return NextResponse.json({ results: [] })
    }

    const limited: MediaRow[] = candidates.slice(0, 60)

    const candidateList = limited.map((row: MediaRow, idx: number) => ({
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

    const prompt = `Ты помощник PR-специалиста. Выбери топ-${topN} наиболее подходящих медиа для задания.

ЗАДАНИЕ: ${task}

КАНДИДАТЫ (${limited.length}):
${JSON.stringify(candidateList, null, 2)}

Верни ТОЛЬКО JSON массив без пояснений и markdown:
[{"idx": 0, "причина_выбора": "...", "тематика": "...", "описание": "..."}]

Правила:
- Выбери ровно ${topN} лучших (или меньше если кандидатов недостаточно)
- ГЕОГРАФИЯ: ${region ? `Целевой регион — ${region}. Жёстко исключай издания из других регионов, не имеющих отношения к ${region}.` : 'Учитывай регион из задания если указан.'}
- СПЕЦИАЛИЗАЦИЯ: Исключай издания общей тематики без прямой связи с профилем клиента.
- ТРАФИК: Кандидаты отсортированы по трафику — при прочих равных предпочитай более охватные.
- Если есть "drawbacks" — добавь ⚠️ в начало причины выбора.
- "описание" — нейтральная характеристика медиа/конкурса 1-2 предложения, независимо от задания. Используй description, topic, industries из данных кандидата.
- Верни строго валидный JSON`

    const msg = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    })

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '[]'

    let rankings: Array<{ idx: number; причина_выбора: string; тематика: string; описание: string }> = []
    try {
      const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/)
      if (!jsonMatch) throw new Error('No JSON array in response')
      rankings = JSON.parse(jsonMatch[0])
    } catch {
      // Fallback
      return NextResponse.json({
        results: limited.slice(0, topN).map((row: MediaRow, i: number) => ({
          Критерий: String(i + 1),
          Название: row.name || '',
          Ссылка: row.url || '',
          'Цена из базы': row.price || '',
          Валюта: row.currency || '',
          'Причина выбора': row.description || row['Описание generated'] || '',
          Описание: '',
          Тематика: row.topic || '',
          'Из какой базы': row.base_name || '',
          Подтип: row['Подтип'] || row['подтип.1'] || '',
          Трафик: row.traffic || '',
          'Дата проведения': row['Крайняя дата подачи'] || '',
          'Формы участия': row['Доступные формы участия'] || '',
          'Индексирование и архивирование': row['Индексирование и архивирование'] || '',
          'Описание сроков выхода': row['Описание сроков выхода'] || '',
          Регион: row.region || '',
        }))
      })
    }

    const results: ResultRow[] = rankings.map((r, position) => {
      const row = limited[r.idx]
      if (!row) return null
      return {
        Критерий: String(position + 1),
        Название: row.name || '',
        Ссылка: row.url || '',
        'Цена из базы': row.price || '',
        Валюта: row.currency || '',
        'Причина выбора': r.причина_выбора || '',
        Описание: r.описание || '',
        Тематика: r.тематика || '',
        'Из какой базы': row.base_name || '',
        Подтип: row['Подтип'] || row['подтип.1'] || '',
        Трафик: String(row.traffic || ''),
        'Дата проведения': row['Крайняя дата подачи'] || '',
        'Формы участия': row['Доступные формы участия'] || '',
        'Индексирование и архивирование': row['Индексирование и архивирование'] || '',
        'Описание сроков выхода': row['Описание сроков выхода'] || '',
        Регион: row.region || '',
      } as ResultRow
    }).filter(Boolean) as ResultRow[]

    return NextResponse.json({ results })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ошибка'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
