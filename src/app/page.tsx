'use client'

import { useState, useCallback } from 'react'
import { EntityType, ResultRow } from '@/lib/types'

const ENTITY_TYPES: EntityType[] = ['СМИ', 'Конкурс', 'Научные статьи', 'Ассоциация']

interface SearchMeta {
  keywords: string[]
  region: string | null
  candidatesFound: number
  topN: number
}

type LoadingStep = 'keywords' | 'fetching' | 'ranking' | null

function downloadCSV(results: ResultRow[]) {
  if (!results.length) return
  const headers = Object.keys(results[0])
  const rows = results.map(r =>
    headers.map(h => {
      const val = (r as unknown as Record<string, string>)[h] ?? ''
      return `"${String(val).replace(/"/g, '""')}"`
    }).join(',')
  )
  const csv = [headers.join(','), ...rows].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `media_selection_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function HomePage() {
  const [task, setTask] = useState('')
  const [entityTypes, setEntityTypes] = useState<EntityType[]>(['СМИ'])
  const [topN, setTopN] = useState(20)
  const [loadingStep, setLoadingStep] = useState<LoadingStep>(null)
  const [results, setResults] = useState<ResultRow[] | null>(null)
  const [candidates, setCandidates] = useState<Record<string, string | number | null>[] | null>(null)
  const [meta, setMeta] = useState<SearchMeta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCandidates, setShowCandidates] = useState(false)

  const toggleType = useCallback((type: EntityType) => {
    setEntityTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    )
  }, [])

  const handleSearch = async () => {
    if (!task.trim()) return
    setError(null)
    setResults(null)
    setMeta(null)

    try {
      setLoadingStep('keywords')
      // Simulate steps for UX (actual progress tracked server-side)
      const timeout1 = setTimeout(() => setLoadingStep('fetching'), 2000)
      const timeout2 = setTimeout(() => setLoadingStep('ranking'), 5000)

      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, entityTypes, topN }),
      })

      clearTimeout(timeout1)
      clearTimeout(timeout2)

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`)
      }

      setResults(data.results)
      setCandidates(data.candidates || null)
      setMeta(data.meta)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Неизвестная ошибка'
      setError(msg)
    } finally {
      setLoadingStep(null)
    }
  }

  const isLoading = loadingStep !== null

  const loadingMessages: Record<NonNullable<LoadingStep>, string> = {
    keywords: 'Извлекаю ключевые слова из задания...',
    fetching: 'Ищу кандидатов в базе медиа...',
    ranking: 'Claude отбирает лучшие варианты...',
  }

  return (
    <main className="app">
      {/* Header */}
      <header className="header">
        <div className="header-eyebrow">PR · AI-подборка</div>
        <h1>Media Picker</h1>
        <p>Введи задание — получи топ медиа, конкурсов или площадок с обоснованием</p>
      </header>

      {/* Search form */}
      <div className="card">
        <div className="form-grid">
          {/* Task */}
          <div>
            <label className="field-label">Задание</label>
            <textarea
              value={task}
              onChange={e => setTask(e.target.value)}
              placeholder="Опиши задание: клиент, продукт, цель, аудитория, гео... Например: «Продвижение B2B SaaS-платформы для автоматизации HR в России, целевая аудитория — директора по персоналу крупных компаний»"
              rows={4}
              disabled={isLoading}
            />
          </div>

          {/* Entity types */}
          <div>
            <label className="field-label">Тип площадки</label>
            <div className="toggle-group">
              {ENTITY_TYPES.map(type => (
                <button
                  key={type}
                  className={`toggle-btn ${entityTypes.includes(type) ? 'active' : ''}`}
                  onClick={() => toggleType(type)}
                  disabled={isLoading}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* TopN + Submit */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <div className="topn-row">
              <label className="field-label" style={{ marginBottom: 0 }}>Топ</label>
              <input
                type="number"
                className="topn-input"
                value={topN}
                min={1}
                max={100}
                onChange={e => setTopN(Math.max(1, Math.min(100, Number(e.target.value))))}
                disabled={isLoading}
              />
              <span className="topn-label">позиций</span>
            </div>

            <button
              className="btn-primary"
              onClick={handleSearch}
              disabled={isLoading || !task.trim() || entityTypes.length === 0}
            >
              {isLoading ? (
                <>
                  <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, marginLeft: 0 }} />
                  Ищу...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M10 10L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  Найти медиа
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="card loading-state">
          <div className="spinner" />
          <div className="loading-step">
            {loadingStep && loadingMessages[loadingStep]}
            {loadingStep === 'ranking' && (
              <><br /><span>claude-sonnet-4-20250514</span></>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="error-state">
          <strong>Ошибка</strong>
          {error}
        </div>
      )}

      {/* Candidates raw view */}
      {showCandidates && candidates && !isLoading && (
        <div style={{ marginBottom: 24 }}>
          <div className="results-header">
            <div className="results-title" style={{ fontSize: 14, color: 'var(--text-muted)' }}>
              Кандидаты из базы
              <span style={{ marginLeft: 8, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--text-dim)' }}>
                {candidates.length} записей
              </span>
            </div>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Название</th>
                  <th>Тип</th>
                  <th>Тематика</th>
                  <th>Описание</th>
                  <th>Отрасли</th>
                  <th>Регион</th>
                  <th>Трафик</th>
                  <th>Цена</th>
                  <th>База</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((row, i) => (
                  <tr key={i}>
                    <td className="rank-cell">{i + 1}</td>
                    <td className="name-cell">
                      {row.url ? (
                        <a href={String(row.url)} target="_blank" rel="noopener noreferrer">
                          {String(row.name || '—')}
                        </a>
                      ) : (
                        String(row.name || '—')
                      )}
                    </td>
                    <td>
                      {row.entity_type ? (
                        <span className="subtype-tag">{String(row.entity_type)}</span>
                      ) : '—'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {String(row.topic || '—')}
                    </td>
                    <td className="reason-cell" style={{ fontSize: 12 }}>
                      {String(row.description || row['Описание generated'] || '—')}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {String(row['Отрасли'] || '—')}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {row.entity_type === 'Научные статьи'
                        ? String(row['Страны'] || '—')
                        : String(row.region || '—')}
                    </td>
                    <td className="traffic-cell">{String(row.traffic || '—')}</td>
                    <td className="price-cell">
                      {row.price ? `${row.price}${row.currency ? ' ' + row.currency : ''}` : '—'}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                      {String(row.base_name || '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Results */}
      {results && !isLoading && (
        <div>
          {/* Meta */}
          {meta && (
            <div className="meta-row">
              <span className="meta-label">Ключевые слова:</span>
              {meta.keywords.map(kw => (
                <span key={kw} className="kw-tag">{kw}</span>
              ))}
              {meta.region && (
                <span style={{
                  background: 'rgba(245,166,35,0.1)',
                  border: '1px solid rgba(245,166,35,0.25)',
                  borderRadius: 4,
                  color: 'var(--warning)',
                  fontSize: 11,
                  fontFamily: 'JetBrains Mono, monospace',
                  padding: '2px 8px',
                  marginLeft: 4,
                }}>
                  📍 {meta.region}
                </span>
              )}
              <span className="meta-stat">
                Найдено кандидатов: <strong>{meta.candidatesFound}</strong> →&nbsp;
                отобрано <strong style={{ color: 'var(--accent)' }}>{results.length}</strong>
              </span>
            </div>
          )}

          {/* Results header */}
          <div className="results-header">
            <div className="results-title">
              Результаты подборки
            </div>
            {results.length > 0 && (
              <button
                className="btn-secondary"
                onClick={() => downloadCSV(results)}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M6.5 1V9M6.5 9L3.5 6M6.5 9L9.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M1 11H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Скачать CSV
              </button>
            )}
          </div>

          {results.length === 0 ? (
            <div className="empty-state">
              Ничего не найдено. Попробуй изменить задание или тип площадки.
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Название</th>
                    <th>Тематика</th>
                    <th>Причина выбора</th>
                    <th>Цена</th>
                    <th>Подтип</th>
                    <th>Трафик</th>
                    <th>Регион</th>
                    <th>Дата / Дедлайн</th>
                    <th>Формы участия</th>
                    <th>Индексирование</th>
                    <th>База</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((row, i) => (
                    <tr key={i}>
                      <td className="rank-cell">{row.Критерий}</td>
                      <td className="name-cell">
                        {row.Ссылка ? (
                          <a href={row.Ссылка} target="_blank" rel="noopener noreferrer">
                            {row.Название}
                          </a>
                        ) : (
                          row.Название
                        )}
                      </td>
                      <td>
                        {row.Тематика && (
                          <span className="topic-tag">{row.Тематика}</span>
                        )}
                      </td>
                      <td className="reason-cell">
                        {row['Причина выбора'].startsWith('⚠️') ? (
                          <span className="warn">{row['Причина выбора']}</span>
                        ) : (
                          row['Причина выбора']
                        )}
                      </td>
                      <td className="price-cell">
                        {row['Цена из базы']
                          ? `${row['Цена из базы']}${row.Валюта ? ' ' + row.Валюта : ''}`
                          : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                      </td>
                      <td>
                        {row.Подтип ? (
                          <span className="subtype-tag">{row.Подтип}</span>
                        ) : (
                          <span style={{ color: 'var(--text-dim)' }}>—</span>
                        )}
                      </td>
                      <td className="traffic-cell">
                        {row.Трафик || <span style={{ color: 'var(--text-dim)' }}>—</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {row.Регион || <span style={{ color: 'var(--text-dim)' }}>—</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {row['Дата проведения'] || <span style={{ color: 'var(--text-dim)' }}>—</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {row['Формы участия'] || <span style={{ color: 'var(--text-dim)' }}>—</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {row['Индексирование и архивирование'] || <span style={{ color: 'var(--text-dim)' }}>—</span>}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                        {row['Из какой базы'] || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </main>
  )
}
