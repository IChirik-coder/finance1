'use client'

import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import {
  Plus, Search, X, ArrowUpRight, ArrowDownRight, Eye, EyeOff,
  ChevronLeft, ChevronRight, Pencil, Trash2, Loader2, Wallet,
  TrendingUp, TrendingDown, BarChart3, ArrowUp,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, isToday, isYesterday, startOfMonth, endOfMonth, eachDayOfInterval, getDaysInMonth } from 'date-fns'
import { ru } from 'date-fns/locale'

// ──────────────────────────── Types ────────────────────────────

interface PlatformEntry { name: string; reviewCount: number }

interface Transaction {
  id: string
  type: 'income' | 'expense'
  amount: number
  description: string
  date: string
  taxRate?: number | null
  platforms?: PlatformEntry[] | null
  category?: string | null
}

// ──────────────────────────── Constants ────────────────────────────

const PLATFORMS = [
  { name: 'Яндекс карты', fee: 50, icon: '/icons/yandex.svg' },
  { name: 'Google карты', fee: 25, icon: '/icons/google-maps.svg' },
  { name: '2ГИС', fee: 25, icon: '/icons/2gis.svg' },
  { name: 'Яндекс Услуги', fee: 50, icon: '/icons/yandex-uslugi.svg' },
  { name: 'Профи.ру', fee: 50, icon: '/icons/profi.svg' },
  { name: 'Авито', fee: 50, icon: '/icons/avito.svg' },
  { name: 'Озон', fee: 25, icon: '/icons/ozon.svg' },
  { name: 'ВКонтакте', fee: 25, icon: '/icons/vk.svg' },
  { name: 'Telegram', fee: 25, icon: '/icons/telegram.svg' },
  { name: 'Яндекс Дзен', fee: 25, icon: '/icons/yandex.svg' },
  { name: 'Tripadvisor', fee: 25, icon: '/icons/tripadvisor.svg' },
  { name: 'Другое', fee: 25, icon: '/icons/other.svg' },
] as const

const PLATFORM_FEE_MAP: Record<string, number> = {}
const PLATFORM_ICON_MAP: Record<string, string> = {}
for (const p of PLATFORMS) { PLATFORM_FEE_MAP[p.name] = p.fee; PLATFORM_ICON_MAP[p.name] = p.icon }

const EXPENSE_CATEGORIES = [
  { value: 'subscriptions', label: 'Подписки', icon: '📺' },
  { value: 'transport', label: 'Транспорт', icon: '🚗' },
  { value: 'food', label: 'Еда', icon: '🍕' },
  { value: 'office', label: 'Офис', icon: '💻' },
  { value: 'marketing', label: 'Маркетинг', icon: '📢' },
  { value: 'taxes', label: 'Налоги', icon: '📋' },
  { value: 'education', label: 'Обучение', icon: '📚' },
  { value: 'other', label: 'Другое', icon: '📦' },
] as const

const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря']

const _currencyFmt = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 })

// ──────────────────────────── Helpers ────────────────────────────

function formatCurrency(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')} млн ₽`
  if (abs >= 100_000) return `${(n / 1_000).toFixed(0)} тыс ₽`
  return _currencyFmt.format(n)
}

function formatFullCurrency(n: number): string {
  return _currencyFmt.format(n)
}

function formatDate(d: string): string {
  const date = new Date(d)
  return `${date.getDate()} ${MONTHS_GEN[date.getMonth()]}`
}

function formatFullDate(d: string): string {
  const date = new Date(d)
  if (isToday(date)) return 'Сегодня'
  if (isYesterday(date)) return 'Вчера'
  return formatDate(d)
}

function parsePlatforms(p: string | PlatformEntry[] | null | undefined): PlatformEntry[] {
  if (!p) return []
  if (Array.isArray(p)) return p
  try { return JSON.parse(p) } catch { return [] }
}

function getNetAmount(t: Transaction): number {
  if (t.type === 'expense') return t.amount
  let net = t.amount
  if (t.taxRate) net -= (t.taxRate / 100) * t.amount
  const platforms = parsePlatforms(t.platforms)
  for (const p of platforms) {
    net -= (PLATFORM_FEE_MAP[p.name] || 0) * p.reviewCount
  }
  return net
}

function getExecutorFee(t: Transaction): number {
  if (t.type === 'expense') return 0
  const platforms = parsePlatforms(t.platforms)
  let fee = 0
  for (const p of platforms) {
    fee += (PLATFORM_FEE_MAP[p.name] || 0) * p.reviewCount
  }
  return fee
}

function getTaxAmount(t: Transaction): number {
  if (t.type === 'expense' || !t.taxRate) return 0
  return (t.taxRate / 100) * t.amount
}

function pluralize(n: number): string {
  const abs = Math.abs(n) % 100
  const n1 = abs % 10
  if (abs > 10 && abs < 20) return 'записей'
  if (n1 > 1 && n1 < 5) return 'записи'
  if (n1 === 1) return 'запись'
  return 'записей'
}

function groupByDate(transactions: Transaction[]): Record<string, Transaction[]> {
  const groups: Record<string, Transaction[]> = {}
  for (const t of transactions) {
    const key = format(new Date(t.date), 'yyyy-MM-dd')
    if (!groups[key]) groups[key] = []
    groups[key].push(t)
  }
  const sorted = Object.entries(groups).sort(([a], [b]) => b.localeCompare(a))
  const result: Record<string, Transaction[]> = {}
  for (const [k, v] of sorted) result[k] = v
  return result
}

// ──────────────────────────── Cache ────────────────────────────

const txCache = new Map<string, { data: Transaction[]; ts: number }>()
const CACHE_TTL = 30_000

async function fetchWithCache(month: number, year: number): Promise<Transaction[]> {
  const key = `${year}-${month}`
  const cached = txCache.get(key)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data
  const res = await fetch(`/api/transactions?month=${month}&year=${year}`)
  if (!res.ok) throw new Error('Fetch failed')
  const data = await res.json()
  txCache.set(key, { data, ts: Date.now() })
  return data
}

function invalidateCache() { txCache.clear() }

// ──────────────────────────── Memoized Sub-components ────────────────────────────

const PlatformIcon = memo(function PlatformIcon({ name, size = 16 }: { name: string; size?: 12 | 16 | 20 }) {
  const icon = PLATFORM_ICON_MAP[name]
  if (!icon) return null
  return <img src={icon} alt={name} width={size} height={size} className="inline-block" />
})

const TransactionRow = memo(function TransactionRow({
  t, isBalanceHidden, onEdit, onDelete,
}: {
  t: Transaction
  isBalanceHidden: boolean
  onEdit: (t: Transaction) => void
  onDelete: (id: string) => void
}) {
  const isIncome = t.type === 'income'
  const platforms = parsePlatforms(t.platforms)
  const categoryObj = EXPENSE_CATEGORIES.find(c => c.value === t.category)

  return (
    <div className="group flex items-center gap-3 py-3 px-1 hover:bg-secondary/50 transition-colors">
      {/* Icon box */}
      <div className={`flex-shrink-0 w-10 h-10 flex items-center justify-center text-sm font-black ${
        isIncome
          ? 'border-2 border-foreground'
          : 'bg-brand text-white'
      }`}>
        {isIncome ? <ArrowUpRight className="w-4 h-4" /> : (
          categoryObj ? <span className="text-base">{categoryObj.icon}</span> : <ArrowDownRight className="w-4 h-4" />
        )}
      </div>

      {/* Description + tags */}
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm truncate">{t.description}</div>
        <div className="flex flex-wrap items-center gap-1 mt-0.5">
          {t.category && categoryObj && (
            <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{categoryObj.label}</span>
          )}
          {platforms.map((p, i) => (
            <span key={i} className="inline-flex items-center gap-0.5 bg-foreground text-background text-[10px] px-1 py-0.5 font-medium">
              <PlatformIcon name={p.name} size={12} />
              {p.reviewCount}
            </span>
          ))}
          {isIncome && t.taxRate && (
            <span className="bg-brand text-white text-[10px] px-1 py-0.5 font-medium">-{t.taxRate}%</span>
          )}
          <span className="text-[10px] text-muted-foreground">{formatDate(t.date)}</span>
          {isIncome && platforms.length > 0 && (
            <span className="text-[10px] text-muted-foreground">
              (комиссии: {formatCurrency(getExecutorFee(t))})
            </span>
          )}
        </div>
      </div>

      {/* Amount */}
      <div className="flex-shrink-0 flex items-center gap-2">
        <span className={`font-black text-sm ${isIncome ? '' : 'text-brand'}`}>
          {isBalanceHidden ? '•••' : `${isIncome ? '+' : '−'}${formatCurrency(t.amount)}`}
        </span>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity max-sm:opacity-50">
          <button onClick={() => onEdit(t)} className="p-1 hover:bg-secondary"><Pencil className="w-3.5 h-3.5" /></button>
          <button onClick={() => onDelete(t.id)} className="p-1 hover:bg-secondary"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
    </div>
  )
})

const StatCard = memo(function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="border-2 p-3 space-y-1">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{label}</span>
      </div>
      <div className="font-black text-lg">{value}</div>
    </div>
  )
})

// ──────────────────────────── Transaction Form ────────────────────────────

function TransactionForm({
  type, setType, amount, setAmount, description, setDescription,
  date, setDate, taxRate, setTaxRate, platforms, togglePlatform,
  setPlatformReviewCount, category, setCategory, isSubmitting,
  onSubmit, submitLabel,
}: {
  type: string; setType: (v: string) => void
  amount: string; setAmount: (v: string) => void
  description: string; setDescription: (v: string) => void
  date: string; setDate: (v: string) => void
  taxRate: string; setTaxRate: (v: string) => void
  platforms: PlatformEntry[]; togglePlatform: (name: string) => void
  setPlatformReviewCount: (name: string, count: number) => void
  category: string; setCategory: (v: string) => void
  isSubmitting: boolean
  onSubmit: () => void
  submitLabel: string
}) {
  const isIncome = type === 'income'
  const selectedPlatforms = platforms.filter(p => p.reviewCount > 0)
  const numAmount = parseFloat(amount) || 0

  const totalExecutorFee = selectedPlatforms.reduce((sum, p) => sum + (PLATFORM_FEE_MAP[p.name] || 0) * p.reviewCount, 0)
  const totalTax = (taxRate === '4' || taxRate === '6') ? (parseInt(taxRate) / 100) * numAmount : 0
  const netAmount = isIncome ? numAmount - totalTax - totalExecutorFee : numAmount

  return (
    <div className="space-y-4">
      {/* Type */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => { setType('income') }}
          className={`h-10 text-sm font-black uppercase tracking-[0.15em] border-2 transition-colors ${
            isIncome ? 'bg-foreground text-background border-foreground' : 'border-border hover:border-foreground'
          }`}
        >
          Доход
        </button>
        <button
          type="button"
          onClick={() => { setType('expense'); setTaxRate('none') }}
          className={`h-10 text-sm font-black uppercase tracking-[0.15em] border-2 transition-colors ${
            !isIncome ? 'bg-brand text-white border-brand' : 'border-border hover:border-brand'
          }`}
        >
          Расход
        </button>
      </div>

      {/* Amount */}
      <div className="relative">
        <Input
          type="number"
          placeholder="0"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          className="text-2xl font-black h-14 pr-10 border-2"
          min="0"
          step="any"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xl font-black text-muted-foreground">₽</span>
      </div>

      {/* Category (expense only) */}
      {!isIncome && (
        <div>
          <label className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-2 block">Категория</label>
          <div className="grid grid-cols-4 gap-1.5">
            {EXPENSE_CATEGORIES.map(c => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                className={`flex flex-col items-center gap-0.5 p-2 text-[10px] border-2 transition-colors ${
                  category === c.value
                    ? 'bg-foreground text-background border-foreground'
                    : 'border-border hover:border-foreground'
                }`}
              >
                <span className="text-base">{c.icon}</span>
                <span className="uppercase tracking-wider">{c.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Platforms (income only) */}
      {isIncome && (
        <div>
          <label className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-2 block">Площадки</label>
          <div className="grid grid-cols-3 gap-1.5">
            {PLATFORMS.map(p => {
              const selected = platforms.find(pl => pl.name === p.name && pl.reviewCount > 0)
              return (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => togglePlatform(p.name)}
                  className={`flex items-center gap-1.5 p-2 text-[10px] border-2 transition-colors ${
                    selected
                      ? 'bg-foreground text-background border-foreground'
                      : 'border-border hover:border-foreground'
                  }`}
                >
                  <PlatformIcon name={p.name} size={16} />
                  <span className="truncate uppercase tracking-wider">{p.name}</span>
                  {selected && <span className="ml-auto text-brand-light">✓</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Review counts (income + selected platforms) */}
      {isIncome && selectedPlatforms.length > 0 && (
        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Количество отзывов</label>
          {selectedPlatforms.map(p => (
            <div key={p.name} className="flex items-center gap-2 border-2 p-2">
              <PlatformIcon name={p.name} size={20} />
              <span className="text-xs font-medium flex-shrink-0">{p.name}</span>
              <Input
                type="number"
                min="1"
                value={p.reviewCount}
                onChange={e => setPlatformReviewCount(p.name, parseInt(e.target.value) || 0)}
                className="h-8 w-20 text-sm border-2"
              />
              <span className="text-[10px] text-muted-foreground">
                {PLATFORM_FEE_MAP[p.name] || 0}₽ × {p.reviewCount} = {((PLATFORM_FEE_MAP[p.name] || 0) * p.reviewCount)}₽
              </span>
              <button
                type="button"
                onClick={() => setPlatformReviewCount(p.name, 0)}
                className="ml-auto p-1 hover:bg-secondary"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Tax rate (income only) */}
      {isIncome && (
        <div>
          <label className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-2 block">Налоговый вычет</label>
          <div className="grid grid-cols-3 gap-2">
            {(['none', '4', '6'] as const).map(rate => (
              <button
                key={rate}
                type="button"
                onClick={() => setTaxRate(rate)}
                className={`h-10 text-sm font-black uppercase tracking-[0.15em] border-2 transition-colors ${
                  taxRate === rate
                    ? (rate === 'none' ? 'bg-foreground text-background border-foreground' : 'bg-brand text-white border-brand')
                    : 'border-border hover:border-foreground'
                }`}
              >
                {rate === 'none' ? 'Без вычета' : `${rate}%`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Preview (income + filled amount) */}
      {isIncome && numAmount > 0 && (
        <div className="border-2 border-border p-4 bg-secondary/50 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Сумма</span>
            <span className="font-bold">{formatFullCurrency(numAmount)}</span>
          </div>
          {totalTax > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Налог</span>
              <span className="font-bold text-brand">−{formatFullCurrency(totalTax)}</span>
            </div>
          )}
          {totalExecutorFee > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Исполнители</span>
              <span className="font-bold text-brand">−{formatFullCurrency(totalExecutorFee)}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between text-sm">
            <span className="font-black uppercase tracking-[0.15em]">К выдаче</span>
            <span className="font-black text-lg">{formatFullCurrency(netAmount)}</span>
          </div>
        </div>
      )}

      {/* Description */}
      <div>
        <label className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-1 block">Описание</label>
        <Input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Например: Зарплата за январь"
          className="border-2"
        />
      </div>

      {/* Date */}
      <div>
        <label className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-1 block">Дата</label>
        <Input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="border-2"
        />
      </div>

      {/* Submit */}
      <Button
        onClick={onSubmit}
        disabled={isSubmitting}
        className={`w-full h-12 font-black uppercase tracking-[0.15em] ${
          isIncome ? 'bg-foreground text-background hover:bg-foreground/90' : 'bg-brand text-white hover:bg-brand/90'
        }`}
      >
        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : submitLabel}
      </Button>
    </div>
  )
}

// ──────────────────────────── Main Component ────────────────────────────

export default function Home() {
  const now = new Date()

  // State
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [filterTab, setFilterTab] = useState<'all' | 'income' | 'expense'>('all')
  const [isBalanceHidden, setIsBalanceHidden] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [showScrollTop, setShowScrollTop] = useState(false)

  // Add form
  const [formType, setFormType] = useState('income')
  const [formAmount, setFormAmount] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formDate, setFormDate] = useState(format(now, 'yyyy-MM-dd'))
  const [formTaxRate, setFormTaxRate] = useState<string>('none')
  const [formPlatforms, setFormPlatforms] = useState<PlatformEntry[]>(
    PLATFORMS.map(p => ({ name: p.name, reviewCount: 0 }))
  )
  const [formCategory, setFormCategory] = useState('other')

  // Edit form
  const [editId, setEditId] = useState('')
  const [editType, setEditType] = useState('income')
  const [editAmount, setEditAmount] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editTaxRate, setEditTaxRate] = useState<string>('none')
  const [editPlatforms, setEditPlatforms] = useState<PlatformEntry[]>(
    PLATFORMS.map(p => ({ name: p.name, reviewCount: 0 }))
  )
  const [editCategory, setEditCategory] = useState('other')

  // Refs
  const searchRef = useRef<HTMLInputElement>(null)
  const isFetchingRef = useRef(false)

  // Scroll handler
  useEffect(() => {
    let rafId: number
    const handleScroll = () => {
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        setShowScrollTop(window.scrollY > 400)
      })
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => { window.removeEventListener('scroll', handleScroll); cancelAnimationFrame(rafId) }
  }, [])

  // Fetch transactions
  const fetchTransactions = useCallback(async () => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    setIsLoading(true)
    try {
      const data = await fetchWithCache(selectedMonth, selectedYear)
      setTransactions(data)
    } catch (err) {
      console.error(err)
      toast.error('Ошибка загрузки транзакций')
    } finally {
      setIsLoading(false)
      isFetchingRef.current = false
    }
  }, [selectedMonth, selectedYear])

  useEffect(() => { fetchTransactions() }, [fetchTransactions])

  // Toggle platform helpers
  const togglePlatform = useCallback((name: string) => {
    setFormPlatforms(prev => prev.map(p =>
      p.name === name ? { ...p, reviewCount: p.reviewCount > 0 ? 0 : 1 } : p
    ))
  }, [])

  const setPlatformReviewCount = useCallback((name: string, count: number) => {
    setFormPlatforms(prev => prev.map(p =>
      p.name === name ? { ...p, reviewCount: count } : p
    ))
  }, [])

  const toggleEditPlatform = useCallback((name: string) => {
    setEditPlatforms(prev => prev.map(p =>
      p.name === name ? { ...p, reviewCount: p.reviewCount > 0 ? 0 : 1 } : p
    ))
  }, [])

  const setEditPlatformReviewCount = useCallback((name: string, count: number) => {
    setEditPlatforms(prev => prev.map(p =>
      p.name === name ? { ...p, reviewCount: count } : p
    ))
  }, [])

  // Open edit dialog
  const openEditDialog = useCallback((t: Transaction) => {
    setEditId(t.id)
    setEditType(t.type)
    setEditAmount(String(t.amount))
    setEditDescription(t.description)
    setEditDate(format(new Date(t.date), 'yyyy-MM-dd'))
    setEditTaxRate(t.taxRate ? String(t.taxRate) : 'none')
    setEditCategory(t.category || 'other')

    const parsedPlatforms = parsePlatforms(t.platforms)
    setEditPlatforms(PLATFORMS.map(p => {
      const found = parsedPlatforms.find(pp => pp.name === p.name)
      return { name: p.name, reviewCount: found ? found.reviewCount : 0 }
    }))

    setIsEditDialogOpen(true)
  }, [])

  // Validation
  const validateForm = useCallback((mode: 'add' | 'edit'): string | null => {
    const amt = mode === 'add' ? formAmount : editAmount
    const desc = mode === 'add' ? formDescription : editDescription
    if (!parseFloat(amt) || parseFloat(amt) <= 0) return 'Укажите сумму'
    if (!desc.trim()) return 'Укажите описание'
    return null
  }, [formAmount, formDescription, editAmount, editDescription])

  // Reset add form
  const resetAddForm = useCallback(() => {
    setFormType('income')
    setFormAmount('')
    setFormDescription('')
    setFormDate(format(new Date(), 'yyyy-MM-dd'))
    setFormTaxRate('none')
    setFormPlatforms(PLATFORMS.map(p => ({ name: p.name, reviewCount: 0 })))
    setFormCategory('other')
  }, [])

  // Submit handlers
  const handleAddSubmit = useCallback(async () => {
    const error = validateForm('add')
    if (error) { toast.error(error); return }

    setIsSubmitting(true)
    try {
      const selectedPlats = formPlatforms.filter(p => p.reviewCount > 0)
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: formType,
          amount: parseFloat(formAmount),
          description: formDescription,
          date: formDate || new Date().toISOString(),
          taxRate: formTaxRate === 'none' ? null : parseInt(formTaxRate),
          platforms: formType === 'income' && selectedPlats.length > 0 ? selectedPlats : null,
          category: formType === 'expense' ? formCategory : null,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      invalidateCache()
      await fetchTransactions()
      setIsDialogOpen(false)
      resetAddForm()
      toast.success('Транзакция добавлена')
    } catch {
      toast.error('Ошибка при добавлении')
    } finally {
      setIsSubmitting(false)
    }
  }, [formType, formAmount, formDescription, formDate, formTaxRate, formPlatforms, formCategory, validateForm, fetchTransactions, resetAddForm])

  const handleEditSubmit = useCallback(async () => {
    const error = validateForm('edit')
    if (error) { toast.error(error); return }

    setIsSubmitting(true)
    try {
      const selectedPlats = editPlatforms.filter(p => p.reviewCount > 0)
      const res = await fetch('/api/transactions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editId,
          type: editType,
          amount: parseFloat(editAmount),
          description: editDescription,
          date: editDate || new Date().toISOString(),
          taxRate: editTaxRate === 'none' ? null : parseInt(editTaxRate),
          platforms: editType === 'income' && selectedPlats.length > 0 ? selectedPlats : null,
          category: editType === 'expense' ? editCategory : null,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      invalidateCache()
      await fetchTransactions()
      setIsEditDialogOpen(false)
      toast.success('Транзакция обновлена')
    } catch {
      toast.error('Ошибка при обновлении')
    } finally {
      setIsSubmitting(false)
    }
  }, [editId, editType, editAmount, editDescription, editDate, editTaxRate, editPlatforms, editCategory, validateForm, fetchTransactions])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      const res = await fetch(`/api/transactions?id=${deleteTarget}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed')
      invalidateCache()
      await fetchTransactions()
      setDeleteTarget(null)
      toast.success('Транзакция удалена')
    } catch {
      toast.error('Ошибка при удалении')
    }
  }, [deleteTarget, fetchTransactions])

  // Month navigation
  const goToPrevMonth = useCallback(() => {
    setSelectedMonth(prev => {
      if (prev === 1) { setSelectedYear(y => y - 1); return 12 }
      return prev - 1
    })
  }, [])

  const goToNextMonth = useCallback(() => {
    setSelectedMonth(prev => {
      if (prev === 12) { setSelectedYear(y => y + 1); return 1 }
      return prev + 1
    })
  }, [])

  const goToCurrentMonth = useCallback(() => {
    const n = new Date()
    setSelectedMonth(n.getMonth() + 1)
    setSelectedYear(n.getFullYear())
  }, [])

  // ──────────────── Memoized computations ────────────────

  const stats = useMemo(() => {
    const incomes = transactions.filter(t => t.type === 'income')
    const expenses = transactions.filter(t => t.type === 'expense')

    const totalIncome = incomes.reduce((s, t) => s + getNetAmount(t), 0)
    const totalGrossIncome = incomes.reduce((s, t) => s + t.amount, 0)
    const totalExecutorFee = incomes.reduce((s, t) => s + getExecutorFee(t), 0)
    const totalTax = incomes.reduce((s, t) => s + getTaxAmount(t), 0)
    const totalExpense = expenses.reduce((s, t) => s + t.amount, 0)
    const balance = totalIncome - totalExpense

    const incomeCount = incomes.length
    const expenseCount = expenses.length
    const avgIncome = incomeCount ? totalIncome / incomeCount : 0
    const avgExpense = expenseCount ? totalExpense / expenseCount : 0
    const maxIncome = incomeCount ? Math.max(...incomes.map(t => getNetAmount(t))) : 0
    const maxExpense = expenseCount ? Math.max(...expenses.map(t => t.amount)) : 0

    const expenseRatio = totalIncome > 0 ? (totalExpense / totalIncome) * 100 : 0

    const categoryBreakdown: Record<string, number> = {}
    for (const t of expenses) {
      if (t.category) categoryBreakdown[t.category] = (categoryBreakdown[t.category] || 0) + t.amount
    }

    const dailyData: Record<number, { income: number; expense: number }> = {}
    for (const t of transactions) {
      const day = new Date(t.date).getDate()
      if (!dailyData[day]) dailyData[day] = { income: 0, expense: 0 }
      if (t.type === 'income') dailyData[day].income += getNetAmount(t)
      else dailyData[day].expense += t.amount
    }

    const maxDaily = Math.max(...Object.values(dailyData).flatMap(d => [d.income, d.expense]), 0)

    return {
      totalIncome, totalGrossIncome, totalExecutorFee, totalTax, totalExpense,
      balance, incomeCount, expenseCount, avgIncome, avgExpense,
      maxIncome, maxExpense, expenseRatio, categoryBreakdown, dailyData, maxDaily,
    }
  }, [transactions])

  const filteredTransactions = useMemo(() => {
    let filtered = transactions
    if (filterTab === 'income') filtered = filtered.filter(t => t.type === 'income')
    if (filterTab === 'expense') filtered = filtered.filter(t => t.type === 'expense')
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(t =>
        t.description.toLowerCase().includes(q) ||
        (t.category && t.category.toLowerCase().includes(q)) ||
        String(t.amount).includes(q)
      )
    }
    return filtered
  }, [transactions, filterTab, searchQuery])

  const groupedTransactions = useMemo(() => groupByDate(filteredTransactions), [filteredTransactions])

  const daysInMonth = useMemo(() => {
    return getDaysInMonth(new Date(selectedYear, selectedMonth - 1))
  }, [selectedMonth, selectedYear])

  const chartDays = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth])

  const isCurrentMonth = selectedMonth === now.getMonth() + 1 && selectedYear === now.getFullYear()

  // ──────────────── Render ────────────────

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 mix-blend-difference">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="grid grid-cols-2 gap-0.5 w-5 h-5">
              <div className="bg-white" />
              <div className="bg-white opacity-30" />
              <div className="bg-white opacity-30" />
              <div className="bg-white" />
            </div>
            <span className="text-white font-black text-sm uppercase tracking-[0.3em]">Финансы</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowSearch(!showSearch); if (!showSearch) setTimeout(() => searchRef.current?.focus(), 100) }}
              className="p-2 text-white hover:opacity-70 transition-opacity"
            >
              {showSearch ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
            </button>
            <button
              onClick={() => { resetAddForm(); setIsDialogOpen(true) }}
              className="p-2 bg-brand text-white hover:bg-brand-light transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      {/* Search panel */}
      {showSearch && (
        <div className="fixed top-14 left-0 right-0 z-40 bg-background border-b-2 border-border animate-[slideDown_0.2s_ease-out]">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2">
            <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Поиск транзакций..."
              className="flex-1 bg-transparent outline-none text-sm"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="p-1 hover:bg-secondary">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="max-w-3xl mx-auto px-4 pt-20 pb-24">
        {/* Hero section */}
        <section className="mb-8">
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-4">
            [ Трекер доходов и расходов ]
          </p>

          {/* Month navigator */}
          <div className="flex items-center justify-between mb-6">
            <button onClick={goToPrevMonth} className="p-2 hover:bg-secondary transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <h1 className="font-black text-xl uppercase tracking-tighter">
                {MONTHS_RU[selectedMonth - 1]} {selectedYear}
              </h1>
              {!isCurrentMonth && (
                <button
                  onClick={goToCurrentMonth}
                  className="text-[10px] uppercase tracking-[0.15em] border-2 border-border px-2 py-1 hover:border-foreground transition-colors"
                >
                  Сегодня
                </button>
              )}
            </div>
            <button onClick={goToNextMonth} className="p-2 hover:bg-secondary transition-colors">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Balance */}
          <div className="mb-6">
            <div className="flex items-end gap-3">
              <div className="font-black text-4xl sm:text-6xl md:text-[80px] tracking-tighter leading-none">
                {isBalanceHidden ? '•••' : formatCurrency(stats.balance)}
              </div>
              <button
                onClick={() => setIsBalanceHidden(!isBalanceHidden)}
                className="pb-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {isBalanceHidden ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <div className="h-1 w-24 bg-brand opacity-20 mt-2" />
          </div>

          {/* Income / Expense summary */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 border-2 border-foreground flex items-center justify-center">
                <ArrowUpRight className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Доходы</div>
                <div className="font-black text-lg">
                  {isBalanceHidden ? '•••' : formatCurrency(stats.totalIncome)}
                </div>
                {!isBalanceHidden && stats.totalGrossIncome !== stats.totalIncome && (
                  <div className="text-[10px] text-muted-foreground">
                    Гросс {formatCurrency(stats.totalGrossIncome)}
                    {stats.totalTax > 0 && ` · Налог ${formatCurrency(stats.totalTax)}`}
                    {stats.totalExecutorFee > 0 && ` · Исполнители ${formatCurrency(stats.totalExecutorFee)}`}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-brand text-white flex items-center justify-center">
                <ArrowDownRight className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Расходы</div>
                <div className={`font-black text-lg ${isBalanceHidden ? '' : 'text-brand'}`}>
                  {isBalanceHidden ? '•••' : formatCurrency(stats.totalExpense)}
                </div>
              </div>
            </div>
          </div>

          {/* Expense ratio bar */}
          {stats.totalIncome > 0 && !isBalanceHidden && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] uppercase tracking-[0.15em]">
                <span className="text-muted-foreground">Расходы от доходов</span>
                <span className="font-black">{stats.expenseRatio.toFixed(0)}%</span>
              </div>
              <div className="h-2 bg-secondary">
                <div
                  className={`h-full transition-all ${
                    stats.expenseRatio > 90 ? 'bg-brand' : stats.expenseRatio > 70 ? 'bg-brand/70' : 'bg-foreground/60'
                  }`}
                  style={{ width: `${Math.min(stats.expenseRatio, 100)}%` }}
                />
              </div>
            </div>
          )}
        </section>

        {/* Quick stats */}
        {transactions.length > 0 && (
          <section className="mb-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Макс. доход" value={isBalanceHidden ? '•••' : formatCurrency(stats.maxIncome)} />
              <StatCard icon={<TrendingDown className="w-4 h-4" />} label="Макс. расход" value={isBalanceHidden ? '•••' : formatCurrency(stats.maxExpense)} />
              <StatCard icon={<BarChart3 className="w-4 h-4" />} label="Средний доход" value={isBalanceHidden ? '•••' : formatCurrency(stats.avgIncome)} />
              <StatCard icon={<BarChart3 className="w-4 h-4" />} label="Средний расход" value={isBalanceHidden ? '•••' : formatCurrency(stats.avgExpense)} />
            </div>
          </section>
        )}

        {/* Daily activity chart */}
        {Object.keys(stats.dailyData).length > 1 && (
          <section className="mb-8 border-2 border-border p-4">
            <h3 className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-3">Активность по дням</h3>
            <div className="flex items-end gap-[2px] h-24">
              {chartDays.map(day => {
                const d = stats.dailyData[day]
                if (!d) return <div key={day} className="flex-1 flex flex-col justify-end gap-[1px] min-w-0" />
                const maxVal = stats.maxDaily || 1
                const incH = (d.income / maxVal) * 100
                const expH = (d.expense / maxVal) * 100
                return (
                  <div key={day} className="flex-1 flex flex-col justify-end gap-[1px] min-w-0">
                    {d.income > 0 && <div className="bg-foreground/60 w-full" style={{ height: `${incH}%` }} title={`Доход: ${formatCurrency(d.income)}`} />}
                    {d.expense > 0 && <div className="bg-brand/70 w-full" style={{ height: `${expH}%` }} title={`Расход: ${formatCurrency(d.expense)}`} />}
                  </div>
                )
              })}
            </div>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1">
                <div className="w-3 h-2 bg-foreground/60" />
                <span className="text-[10px] text-muted-foreground">Доходы</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-2 bg-brand/70" />
                <span className="text-[10px] text-muted-foreground">Расходы</span>
              </div>
            </div>
          </section>
        )}

        {/* Expense categories */}
        {stats.totalExpense > 0 && !isBalanceHidden && Object.keys(stats.categoryBreakdown).length > 0 && (
          <section className="mb-8 border-2 border-border p-4 space-y-3">
            <h3 className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Категории расходов</h3>
            {Object.entries(stats.categoryBreakdown)
              .sort(([, a], [, b]) => b - a)
              .map(([cat, amount]) => {
                const catObj = EXPENSE_CATEGORIES.find(c => c.value === cat)
                const pct = stats.totalExpense > 0 ? (amount / stats.totalExpense) * 100 : 0
                return (
                  <div key={cat} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span>{catObj?.icon}</span>
                        <span className="font-medium">{catObj?.label || cat}</span>
                      </span>
                      <span className="font-black">{formatCurrency(amount)}</span>
                    </div>
                    <div className="h-1.5 bg-secondary">
                      <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
          </section>
        )}

        {/* Transaction list */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="font-black text-lg uppercase tracking-tighter">Транзакции</h2>
              <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                {filteredTransactions.length} {pluralize(filteredTransactions.length)}
              </span>
            </div>
          </div>

          <Tabs value={filterTab} onValueChange={v => setFilterTab(v as 'all' | 'income' | 'expense')} className="mb-4">
            <TabsList className="w-full">
              <TabsTrigger value="all" className="flex-1 text-[10px] uppercase tracking-[0.15em]">Все</TabsTrigger>
              <TabsTrigger value="income" className="flex-1 text-[10px] uppercase tracking-[0.15em]">Доходы</TabsTrigger>
              <TabsTrigger value="expense" className="flex-1 text-[10px] uppercase tracking-[0.15em]">Расходы</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Loading skeleton */}
          {isLoading && (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-3 animate-pulse">
                  <div className="w-10 h-10 bg-secondary" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-secondary w-3/4" />
                    <div className="h-3 bg-secondary w-1/2" />
                  </div>
                  <div className="h-4 bg-secondary w-20" />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && filteredTransactions.length === 0 && (
            <div className="text-center py-16 space-y-3">
              <Wallet className="w-12 h-12 mx-auto text-muted-foreground" />
              <p className="font-black text-lg uppercase tracking-tighter">Нет транзакций</p>
              <p className="text-sm text-muted-foreground">
                {searchQuery ? 'Попробуйте изменить запрос' : 'Добавьте первую транзакцию'}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => { resetAddForm(); setIsDialogOpen(true) }}
                  className="inline-flex items-center gap-2 bg-brand text-white px-4 py-2 font-black uppercase tracking-[0.15em] text-sm hover:bg-brand-light transition-colors"
                >
                  <Plus className="w-4 h-4" /> Добавить
                </button>
              )}
            </div>
          )}

          {/* Grouped transactions */}
          {!isLoading && Object.entries(groupedTransactions).map(([dateKey, txs]) => (
            <div key={dateKey}>
              <div className="sticky top-[56px] z-10 bg-background/95 backdrop-blur-sm py-2 border-b border-border">
                <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-medium">
                  {formatFullDate(txs[0].date)}
                </span>
              </div>
              <div>
                {txs.map(t => (
                  <TransactionRow
                    key={t.id}
                    t={t}
                    isBalanceHidden={isBalanceHidden}
                    onEdit={openEditDialog}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>
      </main>

      {/* FAB (mobile) */}
      <button
        onClick={() => { resetAddForm(); setIsDialogOpen(true) }}
        className="fixed bottom-6 right-6 h-14 w-14 bg-brand text-white flex items-center justify-center shadow-lg hover:bg-brand-light transition-colors sm:hidden z-30"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Scroll to top */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 left-6 p-3 border-2 border-border hover:border-foreground bg-background z-30 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 rotate-90" />
        </button>
      )}

      {/* Add Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-black uppercase tracking-tighter">Новая транзакция</DialogTitle>
          </DialogHeader>
          <TransactionForm
            type={formType} setType={setFormType}
            amount={formAmount} setAmount={setFormAmount}
            description={formDescription} setDescription={setFormDescription}
            date={formDate} setDate={setFormDate}
            taxRate={formTaxRate} setTaxRate={setFormTaxRate}
            platforms={formPlatforms} togglePlatform={togglePlatform}
            setPlatformReviewCount={setPlatformReviewCount}
            category={formCategory} setCategory={setFormCategory}
            isSubmitting={isSubmitting}
            onSubmit={handleAddSubmit}
            submitLabel="Добавить"
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-black uppercase tracking-tighter">Редактировать</DialogTitle>
          </DialogHeader>
          <TransactionForm
            type={editType} setType={(v) => { setEditType(v); if (v === 'expense') { setEditTaxRate('none'); setEditPlatforms(PLATFORMS.map(p => ({ name: p.name, reviewCount: 0 }))) } }}
            amount={editAmount} setAmount={setEditAmount}
            description={editDescription} setDescription={setEditDescription}
            date={editDate} setDate={setEditDate}
            taxRate={editTaxRate} setTaxRate={setEditTaxRate}
            platforms={editPlatforms} togglePlatform={toggleEditPlatform}
            setPlatformReviewCount={setEditPlatformReviewCount}
            category={editCategory} setCategory={setEditCategory}
            isSubmitting={isSubmitting}
            onSubmit={handleEditSubmit}
            submitLabel="Сохранить"
          />
        </DialogContent>
      </Dialog>

      {/* Delete Alert Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-brand text-white flex items-center justify-center">
                <ArrowUp className="w-5 h-5 rotate-45" />
              </div>
              <AlertDialogTitle className="font-black uppercase tracking-tighter">Удалить?</AlertDialogTitle>
            </div>
            <AlertDialogDescription>Это действие нельзя отменить</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-black uppercase tracking-[0.15em]">Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-brand text-white hover:bg-brand-dark font-black uppercase tracking-[0.15em]">
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* slideDown animation */}
      <style jsx>{`
        @keyframes slideDown {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
