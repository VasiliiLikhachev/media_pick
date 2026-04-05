export type EntityType = 'СМИ' | 'Конкурс' | 'Научные статьи' | 'Ассоциация'

export interface MediaRow {
  id: number
  'Название': string | null
  'Ссылка': string | null
  'entity_type': string | null
  'description': string | null
  'topic': string | null
  'Для кого': string | null
  'Для кого / есть ли органичения?': string | null
  'Категории или кластеры': string | null
  'Номинации': string | null
  'Описание SimilarWeb': string | null
  'Описание generated': string | null
  'Отрасли': string | null
  'Цена': string | null
  'Валюта': string | null
  'Из какой базы': string | null
  'Подтип': string | null
  'подтип.1': string | null
  'Трафик': string | null
  'Тип публикации': string | null
  'Крайняя дата подачи': string | null
  'Доступные формы участия': string | null
  'Индексирование и архивирование': string | null
  'Страны': string | null
  'Недостатки издания': string | null
  [key: string]: string | number | null | undefined
}

export interface SearchParams {
  task: string
  entityTypes: EntityType[]
  topN: number
}

export interface ResultRow {
  Критерий: string
  Название: string
  Ссылка: string
  'Цена из базы': string
  Валюта: string
  'Причина выбора': string
  Тематика: string
  'Из какой базы': string
  Подтип: string
  Трафик: string
  'Тип публикации': string
  'Дата проведения': string
  'Формы участия': string
  'Индексирование и архивирование': string
}
