import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

function normalizeTraffic(val: string | number | null | undefined): number {
  if (!val && val !== 0) return 0
  if (typeof val === 'number') return val
  const s = String(val).replace(/\s/g, '').toUpperCase()
  const num = parseFloat(s.replace(/[KМK]/g, '').replace(',', '.'))
  if (isNaN(num)) return 0
  if (s.includes('M') || s.includes('М')) return Math.round(num * 1_000_000)
  if (s.includes('K') || s.includes('К')) return Math.round(num * 1_000)
  return Math.round(num)
}

export async function POST(req: NextRequest) {
  try {
    const { keywords, entityTypes, region } = await req.json()

    const semanticFields = [
      'description', 'topic', 'Для кого', 'Для кого / есть ли органичения?',
      'Категории или кластеры', 'Номинации', 'Описание SimilarWeb',
      'Описание generated', 'Отрасли', 'Specifics', 'name', 'region',
    ]

    const orConditions: string[] = []
    for (const field of semanticFields) {
      for (const kw of (keywords || [])) {
        orConditions.push(`"${field}".ilike.%${kw}%`)
      }
    }

    let query = getSupabase()
      .from('media_base')
      .select('id, name, url, entity_type, topic, description, "Описание generated", "Отрасли", region, "Страны", traffic, price, currency, base_name, "Недостатки издания", "Подтип", "подтип.1", "Крайняя дата подачи", "Доступные формы участия", "Индексирование и архивирование", "Specifics", "Для кого", "Категории или кластеры", "Номинации"')
      .limit(400)

    if (entityTypes?.length > 0) {
      query = query.in('entity_type', entityTypes)
    }

    if (orConditions.length > 0) {
      query = query.or(orConditions.join(','))
    }

    const { data, error } = await query
    if (error) throw new Error(error.message)

    const rows = data || []

    // Filter by region if specified
    const matchesRegion = (rowRegion: string | null | undefined): boolean => {
      if (!region) return true
      const target = region.toLowerCase()
      const rr = String(rowRegion || '').toLowerCase()
      if (!rr) return true
      if (target === 'russia') return rr.includes('russia')
      return rr.includes(target) || rr.includes('international') || rr.includes('global')
    }

    // Filter by traffic >= 15000 and sort descending
    const filtered = rows
      .filter(r => normalizeTraffic(r.traffic) >= 15_000)
      .filter(r => matchesRegion(r.region))
      .sort((a, b) => normalizeTraffic(b.traffic) - normalizeTraffic(a.traffic))

    return NextResponse.json({ candidates: filtered, total: filtered.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ошибка'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
