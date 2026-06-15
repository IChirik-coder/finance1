'use client'

import { useState, useEffect, useRef, memo, startTransition } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Plus, X, ArrowUpRight, ArrowDownRight, ChevronLeft, ChevronRight,
  Pencil, Trash2, Loader2, Wallet, TrendingUp, TrendingDown, BarChart3,
  Settings, PlusCircle, MinusCircle, Sun, Moon, History,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, isToday, isYesterday, getDaysInMonth } from 'date-fns'

// ─── Types ───

interface PlatformEntry { name: string; reviewCount: number }
interface PlatformConfig { name: string; fee: number; icon: string }
interface Transaction {
  id: string; type: 'income' | 'expense'; amount: number; description: string; date: string
  taxRate?: number | null; platforms?: PlatformEntry[] | null; category?: string | null
}

// ─── Constants ───

const DEFAULT_PLATFORMS: PlatformConfig[] = [
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

function loadPlatforms(): PlatformConfig[] {
  if (typeof window === 'undefined') return DEFAULT_PLATFORMS
  try { const s = localStorage.getItem('finance_platforms'); if (s) { const p = JSON.parse(s); if (Array.isArray(p) && p.length > 0) return p } } catch {}
  return DEFAULT_PLATFORMS
}
function savePlatforms(p: PlatformConfig[]) { try { localStorage.setItem('finance_platforms', JSON.stringify(p)) } catch {} }
function buildFeeMap(p: PlatformConfig[]): Record<string, number> { const m: Record<string, number> = {}; for (const x of p) m[x.name] = x.fee; return m }
function buildIconMap(p: PlatformConfig[]): Record<string, string> { const m: Record<string, string> = {}; for (const x of p) m[x.name] = x.icon; return m }

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
const _cf = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 })

// ─── Helpers ───

function fmtCur(n: number): string {
  const a = Math.abs(n); if (a >= 1_000_000) return `${(n/1_000_000).toFixed(1).replace(/\.0$/,'')} млн ₽`; if (a >= 100_000) return `${(n/1_000).toFixed(0)} тыс ₽`; return _cf.format(n)
}
function fmtFull(n: number) { return _cf.format(n) }
function fmtDate(d: string) { const dt = new Date(d); return `${dt.getDate()} ${MONTHS_GEN[dt.getMonth()]}` }
function fmtFullDate(d: string) { const dt = new Date(d); if (isToday(dt)) return 'Сегодня'; if (isYesterday(dt)) return 'Вчера'; return fmtDate(d) }
function parsePlatforms(p: string | PlatformEntry[] | null | undefined): PlatformEntry[] { if (!p) return []; if (Array.isArray(p)) return p; try { return JSON.parse(p) } catch { return [] } }
function getNet(t: Transaction, fm: Record<string, number>): number { if (t.type === 'expense') return t.amount; let n = t.amount; if (t.taxRate) n -= (t.taxRate/100)*t.amount; for (const p of parsePlatforms(t.platforms)) n -= (fm[p.name]||0)*p.reviewCount; return n }
function getFee(t: Transaction, fm: Record<string, number>): number { if (t.type === 'expense') return 0; let f = 0; for (const p of parsePlatforms(t.platforms)) f += (fm[p.name]||0)*p.reviewCount; return f }
function getTax(t: Transaction): number { if (t.type === 'expense' || !t.taxRate) return 0; return (t.taxRate/100)*t.amount }
function pluralize(n: number): string { const a = Math.abs(n)%100, a1=a%10; if (a>10&&a<20) return 'записей'; if (a1>1&&a1<5) return 'записи'; if (a1===1) return 'запись'; return 'записей' }
function groupByDate(txs: Transaction[]): Record<string, Transaction[]> { const g: Record<string, Transaction[]> = {}; for (const t of txs) { const k = format(new Date(t.date),'yyyy-MM-dd'); if (!g[k]) g[k]=[]; g[k].push(t) } return Object.fromEntries(Object.entries(g).sort(([a],[b])=>b.localeCompare(a))) }

// ─── Cache ───

const cache = new Map<string, { data: Transaction[]; ts: number }>()
async function fetchCached(m: number, y: number): Promise<Transaction[]> { const k=`${y}-${m}`; const c=cache.get(k); if (c&&Date.now()-c.ts<30000) return c.data; const r=await fetch(`/api/transactions?month=${m}&year=${y}`); if (!r.ok) throw new Error(); const d=await r.json(); cache.set(k,{data:d,ts:Date.now()}); return d }

// ─── Month history ───

interface MonthHistoryEntry { month: number; year: number; grossIncome: number; expense: number; count: number; tax: number; platformFees: Record<string, { fee: number; reviewCount: number }> }
let historyCache: { data: MonthHistoryEntry[]; ts: number } | null = null
async function fetchMonthHistory(): Promise<MonthHistoryEntry[]> {
  if (historyCache && Date.now() - historyCache.ts < 30000) return historyCache.data
  const r = await fetch('/api/transactions/history')
  if (!r.ok) throw new Error()
  const d = await r.json()
  historyCache = { data: d, ts: Date.now() }
  return d
}
function invalidateHistoryCache() { historyCache = null }
function invalidateCache() { cache.clear() }

// ─── Sub-components ───

const PlatformIcon = memo(function PlatformIcon({ name, size = 16, iconMap }: { name: string; size?: 12|16|20|24; iconMap: Record<string,string> }) {
  const icon = iconMap[name]; if (!icon) return null; return <img src={icon} alt={name} width={size} height={size} className="inline-block rounded" />
})

const TransactionRow = memo(function TransactionRow({ t, onEdit, onDelete, feeMap, iconMap }: {
  t: Transaction; onEdit: (t: Transaction) => void; onDelete: (id: string) => void; feeMap: Record<string,number>; iconMap: Record<string,string>
}) {
  const isIncome = t.type === 'income'
  const platforms = parsePlatforms(t.platforms)

  return (
    <div className="transaction-row group">
      <div className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl ${
        isIncome ? 'bg-[var(--income-bg)] text-[var(--income-color)]' : 'bg-[var(--expense-bg)] text-[var(--expense-color)]'
      }`}>
        {isIncome ? <ArrowUpRight className="w-4.5 h-4.5" /> : <ArrowDownRight className="w-4.5 h-4.5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm text-foreground truncate">{t.description.charAt(0).toUpperCase() + t.description.slice(1)}</div>
        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
          {platforms.map((p, i) => (
            <span key={i} className="inline-flex items-center gap-1 bg-secondary text-muted-foreground text-[11px] px-2 py-0.5 rounded-full font-medium">
              <PlatformIcon name={p.name} size={12} iconMap={iconMap} />{p.reviewCount}
            </span>
          ))}
          {isIncome && t.taxRate && <span className="bg-primary/15 text-primary text-[11px] px-2 py-0.5 rounded-full font-medium">-{t.taxRate}%</span>}
          <span className="text-[11px] text-muted-foreground">{fmtDate(t.date)}</span>
          {isIncome && platforms.length > 0 && <span className="text-[11px] text-muted-foreground">(комиссии: {fmtCur(getFee(t, feeMap))})</span>}
        </div>
      </div>
      <div className="flex-shrink-0 flex items-center gap-2">
        <span className={`font-semibold text-sm tabular-nums ${isIncome ? 'text-[var(--income-color)]' : 'text-[var(--expense-color)]'}`}>
          {`${isIncome ? '+' : '−'}${fmtCur(t.amount)}`}
        </span>
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button onClick={() => onEdit(t)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><Pencil className="w-3.5 h-3.5 text-muted-foreground" /></button>
          <button onClick={() => onDelete(t.id)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><Trash2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
        </div>
      </div>
    </div>
  )
})

const StatCard = memo(function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="liquid-glass rounded-2xl p-4 space-y-1.5">
      <div className="flex items-center gap-2"><span className="text-primary">{icon}</span><span className="text-[11px] font-medium text-muted-foreground tracking-wide">{label}</span></div>
      <div className="font-semibold text-lg tabular-nums text-foreground">{value}</div>
    </div>
  )
})

// ─── Transaction Form ───

function TransactionForm({ type, setType, amount, setAmount, description, setDescription, date, setDate, taxRate, setTaxRate, platforms, togglePlatform, setPlatformReviewCount, category, setCategory, isSubmitting, onSubmit, submitLabel, platformsList, feeMap, iconMap }: {
  type: string; setType: (v: string) => void; amount: string; setAmount: (v: string) => void; description: string; setDescription: (v: string) => void; date: string; setDate: (v: string) => void; taxRate: string; setTaxRate: (v: string) => void; platforms: PlatformEntry[]; togglePlatform: (name: string) => void; setPlatformReviewCount: (name: string, count: number) => void; category: string; setCategory: (v: string) => void; isSubmitting: boolean; onSubmit: () => void; submitLabel: string; platformsList: PlatformConfig[]; feeMap: Record<string,number>; iconMap: Record<string,string>
}) {
  const isIncome = type === 'income'
  const selectedPlatforms = platforms.filter(p => p.reviewCount > 0)
  const numAmount = parseFloat(amount) || 0
  const totalExecutorFee = selectedPlatforms.reduce((s, p) => s + (feeMap[p.name]||0)*p.reviewCount, 0)
  const totalTax = (taxRate==='4'||taxRate==='6') ? (parseInt(taxRate)/100)*numAmount : 0
  const netAmount = isIncome ? numAmount - totalTax - totalExecutorFee : numAmount

  return (
    <div className="space-y-5">
      {/* Type toggle */}
      <div className="flex liquid-glass rounded-2xl p-1 gap-1">
        <button type="button" onClick={() => setType('income')} className={`flex-1 h-10 text-sm font-semibold rounded-xl transition-all duration-200 ${isIncome ? 'liquid-glass-green !rounded-xl' : 'text-muted-foreground hover:text-foreground/60'}`}>Доход</button>
        <button type="button" onClick={() => { setType('expense'); setTaxRate('none') }} className={`flex-1 h-10 text-sm font-semibold rounded-xl transition-all duration-200 ${!isIncome ? 'liquid-glass-red !rounded-xl' : 'text-muted-foreground hover:text-foreground/60'}`}>Расход</button>
      </div>
      {/* Amount */}
      <div className="relative">
        <Input type="number" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} className="text-3xl font-semibold h-16 pr-12 rounded-2xl liquid-glass-input tabular-nums text-foreground" min="0" step="any" />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xl font-semibold text-muted-foreground">₽</span>
      </div>

      {/* Platforms */}
      {isIncome && (
        <div>
          <label className="text-[11px] font-medium text-muted-foreground mb-2 block tracking-wide">Площадки</label>
          <div className="grid grid-cols-3 gap-2">
            {platformsList.map(p => {
              const sel = platforms.find(pl => pl.name === p.name && pl.reviewCount > 0)
              return (
                <button key={p.name} type="button" onClick={() => togglePlatform(p.name)} className={`flex items-center gap-1.5 p-2.5 text-[11px] rounded-2xl transition-all duration-200 ${sel ? 'liquid-glass-green !rounded-2xl font-semibold' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}>
                  <PlatformIcon name={p.name} size={16} iconMap={iconMap} /><span className="truncate">{p.name}</span>{sel && <span className="ml-auto text-[var(--income-color)]/60">✓</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
      {/* Review counts */}
      {isIncome && selectedPlatforms.length > 0 && (
        <div className="space-y-2">
          <label className="text-[11px] font-medium text-muted-foreground tracking-wide">Количество отзывов</label>
          {selectedPlatforms.map(p => (
            <div key={p.name} className="liquid-glass rounded-2xl p-3">
              <div className="flex items-center gap-2.5">
                <PlatformIcon name={p.name} size={20} iconMap={iconMap} />
                <span className="text-xs font-medium flex-shrink-0 text-foreground/70 truncate">{p.name}</span>
                <div className="liquid-stepper ml-auto">
                  <button type="button" className="liquid-stepper-btn" onClick={() => setPlatformReviewCount(p.name, Math.max(0, p.reviewCount - 1))}><MinusCircle /></button>
                  <input type="number" min="0" value={p.reviewCount} onChange={e => setPlatformReviewCount(p.name, parseInt(e.target.value)||0)} className="liquid-stepper-value text-foreground" />
                  <button type="button" className="liquid-stepper-btn" onClick={() => setPlatformReviewCount(p.name, p.reviewCount + 1)}><PlusCircle /></button>
                </div>
                <button type="button" onClick={() => setPlatformReviewCount(p.name, 0)} className="flex-shrink-0 p-1 rounded-lg hover:bg-secondary transition-colors"><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
              </div>
              <div className="flex items-center justify-between mt-1.5 pl-8">
                <span className="text-[11px] text-muted-foreground tabular-nums">{feeMap[p.name]||0}₽ × {p.reviewCount} = {((feeMap[p.name]||0)*p.reviewCount)}₽</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Tax */}
      {isIncome && (
        <div>
          <label className="text-[11px] font-medium text-muted-foreground mb-2 block tracking-wide">Налоговый вычет</label>
          <div className="flex liquid-glass rounded-2xl p-1 gap-1">
            {(['none','4','6'] as const).map(rate => (
              <button key={rate} type="button" onClick={() => setTaxRate(rate)} className={`flex-1 h-10 text-sm font-semibold rounded-xl transition-all duration-200 ${taxRate===rate ? (rate==='none' ? 'liquid-glass-sm !rounded-xl !bg-secondary text-foreground' : 'liquid-glass-blue !rounded-xl font-bold') : 'text-muted-foreground hover:text-foreground/60'}`}>
                {rate==='none' ? 'Без вычета' : `${rate}%`}
              </button>
            ))}
          </div>
        </div>
      )}
      {/* Net calculation */}
      {isIncome && numAmount > 0 && (
        <div className="liquid-glass-blue rounded-2xl p-4 space-y-2.5">
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Сумма</span><span className="font-medium tabular-nums text-foreground/80">{fmtFull(numAmount)}</span></div>
          {totalTax > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Налог</span><span className="font-medium text-[var(--expense-color)] tabular-nums">−{fmtFull(totalTax)}</span></div>}
          {totalExecutorFee > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Исполнители</span><span className="font-medium text-[var(--expense-color)] tabular-nums">−{fmtFull(totalExecutorFee)}</span></div>}
          <div className="section-divider !my-2" />
          <div className="flex justify-between text-sm"><span className="font-semibold text-foreground/60">К выдаче</span><span className="font-bold text-lg text-[var(--income-color)] tabular-nums">{fmtFull(netAmount)}</span></div>
        </div>
      )}
      {/* Description & Date */}
      <div><label className="text-[11px] font-medium text-muted-foreground mb-1.5 block tracking-wide">Описание</label><Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Например: Зарплата за январь" className="rounded-2xl liquid-glass-input text-foreground placeholder:text-muted-foreground/50" /></div>
      <div><label className="text-[11px] font-medium text-muted-foreground mb-1.5 block tracking-wide">Дата</label><Input type="date" value={date} onChange={e => setDate(e.target.value)} className="rounded-2xl liquid-glass-input text-foreground" /></div>
      {/* Submit */}
      <Button onClick={onSubmit} disabled={isSubmitting} className="w-full h-12 font-semibold rounded-2xl text-sm liquid-glass-btn">
        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : submitLabel}
      </Button>
    </div>
  )
}

// ─── Main ───

export default function Home() {
  const now = new Date()

  const [mounted, setMounted] = useState(false)
  const [isDark, setIsDark] = useState(false) // SSR default — светлая тема по умолчанию
  const [platforms, setPlatforms] = useState<PlatformConfig[]>(DEFAULT_PLATFORMS)

  useEffect(() => {
    // Read real theme and platforms from localStorage after mount
    try {
      const saved = localStorage.getItem('finance_theme')
      const dark = saved === 'dark'
      startTransition(() => { setIsDark(dark) })
      if (dark) document.documentElement.classList.add('dark')
      else document.documentElement.classList.remove('dark')
    } catch {
      // По умолчанию — светлая тема, не добавляем 'dark'
    }
    // Load custom platforms from localStorage
    try {
      const s = localStorage.getItem('finance_platforms')
      if (s) {
        const p = JSON.parse(s)
        if (Array.isArray(p) && p.length > 0) startTransition(() => { setPlatforms(p) })
      }
    } catch {}
    startTransition(() => { setMounted(true) })
  }, [])

  useEffect(() => {
    if (!mounted) return
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    try { localStorage.setItem('finance_theme', isDark ? 'dark' : 'light') } catch {}
  }, [isDark, mounted])

  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [newPlatformName, setNewPlatformName] = useState('')
  const [newPlatformFee, setNewPlatformFee] = useState('25')

  const feeMap = buildFeeMap(platforms)
  const iconMap = buildIconMap(platforms)

  function updatePlatformFee(name: string, fee: number) {
    setPlatforms(prev => { const u = prev.map(p => p.name===name?{...p,fee}:p); savePlatforms(u); return u })
  }
  function removePlatform(name: string) {
    setPlatforms(prev => { const u = prev.filter(p => p.name!==name); savePlatforms(u); return u })
  }
  function addPlatform() {
    const t = newPlatformName.trim()
    if (!t) { toast.error('Введите название площадки'); return }
    if (platforms.some(p => p.name.toLowerCase()===t.toLowerCase())) { toast.error('Такая площадка уже есть'); return }
    const f = parseInt(newPlatformFee)||0
    if (f<=0) { toast.error('Укажите цену больше 0'); return }
    setPlatforms(prev => { const u = [...prev, {name:t,fee:f,icon:''}]; savePlatforms(u); return u })
    setNewPlatformName(''); setNewPlatformFee('25')
    toast.success(`Площадка «${t}» добавлена`)
  }

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [monthHistory, setMonthHistory] = useState<MonthHistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth()+1)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [filterTab, setFilterTab] = useState<'all'|'income'|'expense'>('all')
  const [deleteTarget, setDeleteTarget] = useState<string|null>(null)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)

  const [formType, setFormType] = useState('income')
  const [formAmount, setFormAmount] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formDate, setFormDate] = useState(format(now, 'yyyy-MM-dd'))
  const [formTaxRate, setFormTaxRate] = useState<string>('none')
  const [formPlatforms, setFormPlatforms] = useState<PlatformEntry[]>(platforms.map(p => ({name:p.name,reviewCount:0})))
  const [formCategory, setFormCategory] = useState('other')

  const [editId, setEditId] = useState('')
  const [editType, setEditType] = useState('income')
  const [editAmount, setEditAmount] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editTaxRate, setEditTaxRate] = useState<string>('none')
  const [editPlatforms, setEditPlatforms] = useState<PlatformEntry[]>(platforms.map(p => ({name:p.name,reviewCount:0})))
  const [editCategory, setEditCategory] = useState('other')

  const isFetchingRef = useRef(false)

  useEffect(() => {
    let rafId: number
    const h = () => { if (rafId) cancelAnimationFrame(rafId); rafId = requestAnimationFrame(() => setShowScrollTop(window.scrollY > 400)) }
    window.addEventListener('scroll', h, {passive:true})
    return () => { window.removeEventListener('scroll', h); cancelAnimationFrame(rafId) }
  }, [])

  async function refreshData() {
    invalidateCache()
    invalidateHistoryCache()
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    setIsLoading(true)
    try {
      const [d, h] = await Promise.all([fetchCached(selectedMonth, selectedYear), fetchMonthHistory()])
      setTransactions(d)
      setMonthHistory(h)
    } catch {
      toast.error('Ошибка загрузки')
    } finally {
      setIsLoading(false)
      isFetchingRef.current = false
    }
  }

  // Force refresh — always runs, no loading spinner, no guard
  async function forceRefresh() {
    invalidateCache()
    invalidateHistoryCache()
    isFetchingRef.current = false
    try {
      const [d, h] = await Promise.all([fetchCached(selectedMonth, selectedYear), fetchMonthHistory()])
      setTransactions(d)
      setMonthHistory(h)
    } catch {
      // Silent — UI already updated optimistically
    }
  }

  useEffect(() => {
    const id = requestAnimationFrame(() => refreshData())
    return () => cancelAnimationFrame(id)
  }, [selectedMonth, selectedYear])

  function togglePlatform(name: string) { setFormPlatforms(prev => prev.map(p => p.name===name?{...p,reviewCount:p.reviewCount>0?0:1}:p)) }
  function setPlatformReviewCount(name: string, count: number) { setFormPlatforms(prev => prev.map(p => p.name===name?{...p,reviewCount:count}:p)) }
  function toggleEditPlatform(name: string) { setEditPlatforms(prev => prev.map(p => p.name===name?{...p,reviewCount:p.reviewCount>0?0:1}:p)) }
  function setEditPlatformReviewCount(name: string, count: number) { setEditPlatforms(prev => prev.map(p => p.name===name?{...p,reviewCount:count}:p)) }

  function openEditDialog(t: Transaction) {
    setEditId(t.id); setEditType(t.type); setEditAmount(String(t.amount)); setEditDescription(t.description); setEditDate(format(new Date(t.date),'yyyy-MM-dd')); setEditTaxRate(t.taxRate?String(t.taxRate):'none'); setEditCategory(t.category||'other')
    const pp = parsePlatforms(t.platforms)
    setEditPlatforms(platforms.map(p => { const f = pp.find(x => x.name===p.name); return {name:p.name, reviewCount:f?f.reviewCount:0} }))
    setIsEditDialogOpen(true)
  }

  function validateForm(mode: 'add'|'edit'): string|null {
    const a = mode==='add'?formAmount:editAmount; const d = mode==='add'?formDescription:editDescription
    if (!parseFloat(a)||parseFloat(a)<=0) return 'Укажите сумму'; if (!d.trim()) return 'Укажите описание'; return null
  }

  function resetAddForm() {
    setFormType('income'); setFormAmount(''); setFormDescription(''); setFormDate(format(new Date(),'yyyy-MM-dd')); setFormTaxRate('none'); setFormPlatforms(platforms.map(p => ({name:p.name,reviewCount:0}))); setFormCategory('other')
  }

  async function handleAddSubmit() {
    const e = validateForm('add'); if (e) { toast.error(e); return }
    setIsSubmitting(true)
    // Build optimistic transaction
    const sp = formPlatforms.filter(p => p.reviewCount>0)
    const optTx: Transaction = {
      id: `opt-${Date.now()}`,
      type: formType as 'income'|'expense',
      amount: parseFloat(formAmount),
      description: formDescription,
      date: formDate || format(new Date(), 'yyyy-MM-dd'),
      taxRate: formTaxRate==='none' ? null : parseInt(formTaxRate),
      platforms: formType==='income' && sp.length>0 ? sp : null,
      category: formType==='expense' ? formCategory : null,
    }
    // Optimistic: add to UI immediately
    setTransactions(prev => [optTx, ...prev])
    setMonthHistory(prev => {
      const d = new Date(optTx.date)
      const m = d.getMonth()+1, y = d.getFullYear()
      const existing = prev.find(h => h.month===m && h.year===y)
      if (existing) {
        return prev.map(h => h.month===m && h.year===y ? {
          ...h,
          grossIncome: optTx.type==='income' ? h.grossIncome+optTx.amount : h.grossIncome,
          expense: optTx.type==='expense' ? h.expense+optTx.amount : h.expense,
          count: h.count+1,
        } : h)
      }
      return [...prev, { month:m, year:y, grossIncome:optTx.type==='income'?optTx.amount:0, expense:optTx.type==='expense'?optTx.amount:0, count:1, tax:0, platformFees:{} }]
    })
    // Close dialog immediately
    setIsDialogOpen(false); resetAddForm()
    try {
      const r = await fetch('/api/transactions', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ type:formType, amount:parseFloat(formAmount), description:formDescription, date:formDate||new Date().toISOString(), taxRate:formTaxRate==='none'?null:parseInt(formTaxRate), platforms:formType==='income'&&sp.length>0?sp:null, category:formType==='expense'?formCategory:null }) })
      if (!r.ok) throw new Error()
      toast.success('Транзакция добавлена')
      await forceRefresh()
    } catch { toast.error('Ошибка при добавлении'); await forceRefresh() } finally { setIsSubmitting(false) }
  }

  async function handleEditSubmit() {
    const e = validateForm('edit'); if (e) { toast.error(e); return }
    setIsSubmitting(true)
    // Build optimistic updated transaction
    const sp = editPlatforms.filter(p => p.reviewCount>0)
    const updatedTx: Transaction = {
      id: editId,
      type: editType as 'income'|'expense',
      amount: parseFloat(editAmount),
      description: editDescription,
      date: editDate || format(new Date(), 'yyyy-MM-dd'),
      taxRate: editTaxRate==='none' ? null : parseInt(editTaxRate),
      platforms: editType==='income' && sp.length>0 ? sp : null,
      category: editType==='expense' ? editCategory : null,
    }
    // Optimistic: update in UI immediately
    setTransactions(prev => prev.map(t => t.id===editId ? updatedTx : t))
    // Close dialog immediately
    setIsEditDialogOpen(false)
    toast.success('Транзакция обновлена')
    try {
      const r = await fetch('/api/transactions', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ id:editId, type:editType, amount:parseFloat(editAmount), description:editDescription, date:editDate||new Date().toISOString(), taxRate:editTaxRate==='none'?null:parseInt(editTaxRate), platforms:editType==='income'&&sp.length>0?sp:null, category:editType==='expense'?editCategory:null }) })
      if (!r.ok) throw new Error()
      await forceRefresh()
    } catch { toast.error('Ошибка при обновлении'); await forceRefresh() } finally { setIsSubmitting(false) }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const id = deleteTarget
    // Optimistic: remove from UI immediately
    setDeleteTarget(null)
    setTransactions(prev => prev.filter(t => t.id !== id))
    setMonthHistory(prev => {
      const tx = transactions.find(t => t.id === id)
      if (!tx) return prev
      return prev.map(h => {
        if (h.month === new Date(tx.date).getMonth() + 1 && h.year === new Date(tx.date).getFullYear()) {
          return { ...h, grossIncome: tx.type === 'income' ? h.grossIncome - tx.amount : h.grossIncome, expense: tx.type === 'expense' ? h.expense - tx.amount : h.expense, count: h.count - 1 }
        }
        return h
      }).filter(h => h.count > 0)
    })
    try {
      const r = await fetch(`/api/transactions?id=${id}`, {method:'DELETE'})
      if (!r.ok) throw new Error()
      toast.success('Транзакция удалена')
      await forceRefresh()
    } catch {
      toast.error('Ошибка при удалении')
      refreshData()
    }
  }

  function goToPrevMonth() { setSelectedMonth(prev => { if (prev===1) { setSelectedYear(y=>y-1); return 12 } return prev-1 }) }
  function goToNextMonth() { setSelectedMonth(prev => { if (prev===12) { setSelectedYear(y=>y+1); return 1 } return prev+1 }) }
  function goToCurrentMonth() { const n = new Date(); setSelectedMonth(n.getMonth()+1); setSelectedYear(n.getFullYear()) }

  const inc = transactions.filter(t => t.type==='income')
  const exp = transactions.filter(t => t.type==='expense')
  const totalIncome = inc.reduce((s,t) => s+getNet(t,feeMap),0)
  const totalGrossIncome = inc.reduce((s,t)=>s+t.amount,0)
  const totalExecutorFee = inc.reduce((s,t)=>s+getFee(t,feeMap),0)
  const totalTax = inc.reduce((s,t)=>s+getTax(t),0)
  const totalExpense = exp.reduce((s,t)=>s+t.amount,0)
  const balance = totalIncome-totalExpense
  const incomeCount = inc.length
  const expenseCount = exp.length
  const avgIncome = incomeCount?totalIncome/incomeCount:0
  const avgExpense = expenseCount?totalExpense/expenseCount:0
  const maxIncome = incomeCount?Math.max(...inc.map(t=>getNet(t,feeMap))):0
  const maxExpense = expenseCount?Math.max(...exp.map(t=>t.amount)):0
  const expenseRatio = totalIncome>0?(totalExpense/totalIncome)*100:0
  const categoryBreakdown: Record<string,number> = {}
  for (const t of exp) { if (t.category) categoryBreakdown[t.category]=(categoryBreakdown[t.category]||0)+t.amount }
  const dailyData: Record<number,{income:number;expense:number}> = {}
  for (const t of transactions) { const d=new Date(t.date).getDate(); if (!dailyData[d]) dailyData[d]={income:0,expense:0}; if (t.type==='income') dailyData[d].income+=getNet(t,feeMap); else dailyData[d].expense+=t.amount }
  const maxDaily = Math.max(...Object.values(dailyData).flatMap(d=>[d.income,d.expense]),0)

  let filteredTransactions = transactions
  if (filterTab==='income') filteredTransactions=filteredTransactions.filter(t=>t.type==='income')
  if (filterTab==='expense') filteredTransactions=filteredTransactions.filter(t=>t.type==='expense')
  const groupedTransactions = groupByDate(filteredTransactions)
  const daysInMonth = getDaysInMonth(new Date(selectedYear, selectedMonth-1))
  const chartDays = Array.from({length:daysInMonth},(_,i)=>i+1)
  const isCurrentMonth = selectedMonth===now.getMonth()+1 && selectedYear===now.getFullYear()

  return (
    <div className="min-h-screen">
      {/* ── Nav bar ── */}
      <nav className="nav-bar">
        <div className="max-w-lg mx-auto px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#3B82F6] to-[#8B5CF6] flex items-center justify-center">
              <span className="text-white text-[11px] font-bold">₽</span>
            </div>
            <span className="font-semibold text-sm tracking-tight text-foreground">Финансы</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setIsHistoryOpen(true)} className="liquid-glass-sm !px-3 !py-2 !rounded-xl transition-colors hover:bg-secondary/50" title="История">
              <History className="w-[18px] h-[18px] text-muted-foreground" />
            </button>
            <button onClick={() => setIsDark(prev => !prev)} className="liquid-glass-sm !px-3 !py-2 !rounded-xl transition-colors hover:bg-secondary/50" title="Тема" suppressHydrationWarning>
              {!mounted ? <Sun className="w-[18px] h-[18px] text-muted-foreground" /> : isDark ? <Sun className="w-[18px] h-[18px] text-muted-foreground" /> : <Moon className="w-[18px] h-[18px] text-muted-foreground" />}
            </button>
            <button onClick={() => setIsSettingsOpen(true)} className="liquid-glass-sm !px-3 !py-2 !rounded-xl transition-colors hover:bg-secondary/50" title="Настройки">
              <Settings className="w-[18px] h-[18px] text-muted-foreground" />
            </button>
            <button onClick={() => { resetAddForm(); setIsDialogOpen(true) }} className="liquid-glass-sm !px-3 !py-2 !rounded-xl !bg-primary !text-primary-foreground !border-primary/50 transition-colors" title="Добавить">
              <Plus className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>
      </nav>

      {/* ── Main ── */}
      <main className="max-w-lg mx-auto px-4 pt-20 pb-28">
        {/* Hero */}
        <section className="mb-8 animate-fade-in-up">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-6" style={{ gap: '20px' }}>
            <button
              onClick={goToPrevMonth}
              className="shrink-0 month-arrow"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '48px',
                height: '48px',
                background: 'linear-gradient(135deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.25) 100%)',
                backdropFilter: 'blur(20px) saturate(1.5)',
                WebkitBackdropFilter: 'blur(20px) saturate(1.5)',
                border: '1px solid rgba(255,255,255,0.5)',
                borderRadius: '16px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.6)',
                color: 'rgba(59,130,246,0.75)',
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="font-semibold text-lg tracking-tight text-foreground truncate">{MONTHS_RU[selectedMonth-1]} {selectedYear}</h1>
              {!isCurrentMonth && <button onClick={goToCurrentMonth} className="text-[11px] font-medium text-primary bg-primary/10 px-3 py-1 rounded-full hover:bg-primary/15 transition-colors shrink-0">Сегодня</button>}
            </div>
            <button
              onClick={goToNextMonth}
              className="shrink-0 month-arrow"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '48px',
                height: '48px',
                background: 'linear-gradient(135deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.25) 100%)',
                backdropFilter: 'blur(20px) saturate(1.5)',
                WebkitBackdropFilter: 'blur(20px) saturate(1.5)',
                border: '1px solid rgba(255,255,255,0.5)',
                borderRadius: '16px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.6)',
                color: 'rgba(59,130,246,0.75)',
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Balance card */}
          <div className="liquid-glass-hero rounded-3xl p-6 mb-5">
            <span className="text-[11px] font-medium text-muted-foreground tracking-wide uppercase">Баланс</span>
            <div className="font-bold text-5xl sm:text-6xl tracking-tight tabular-nums text-gradient-blue mt-1">
              {fmtCur(balance)}
            </div>
          </div>

          {/* Income / Expense */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="liquid-glass-green rounded-2xl p-4">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-8 h-8 rounded-xl bg-[var(--income-bg)] flex items-center justify-center"><ArrowUpRight className="w-4 h-4 text-[var(--income-color)]" /></div>
                <span className="text-[11px] font-medium text-muted-foreground tracking-wide">Доходы</span>
              </div>
              <div className="font-semibold text-lg tabular-nums text-[var(--income-color)]">{fmtCur(totalIncome)}</div>
              {totalGrossIncome !== totalIncome && <div className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">Гросс {fmtCur(totalGrossIncome)}{totalTax>0&&` · Налог ${fmtCur(totalTax)}`}{totalExecutorFee>0&&` · Исполнители ${fmtCur(totalExecutorFee)}`}</div>}
            </div>
            <div className="liquid-glass-red rounded-2xl p-4">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-8 h-8 rounded-xl bg-[var(--expense-bg)] flex items-center justify-center"><ArrowDownRight className="w-4 h-4 text-[var(--expense-color)]" /></div>
                <span className="text-[11px] font-medium text-muted-foreground tracking-wide">Расходы</span>
              </div>
              <div className="font-semibold text-lg tabular-nums text-[var(--expense-color)]">{fmtCur(totalExpense)}</div>
            </div>
          </div>

        </section>

        {/* Daily chart */}
        {Object.keys(dailyData).length > 1 && (
          <section className="mb-8 liquid-glass rounded-3xl p-5 animate-fade-in-up" style={{animationDelay:'0.15s'}}>
            <h3 className="text-[11px] font-medium text-muted-foreground tracking-wide uppercase mb-4">Активность по дням</h3>
            <div className="flex items-end gap-[2px] h-24">
              {chartDays.map(day => { const d = dailyData[day]; if (!d) return <div key={day} className="flex-1 flex flex-col justify-end gap-[1px] min-w-0" />; const mv = maxDaily||1; return (
                <div key={day} className="flex-1 flex flex-col justify-end gap-[1px] min-w-0">
                  {d.income>0 && <div className="bg-[var(--income-color)]/50 w-full rounded-t-sm" style={{height:`${(d.income/mv)*100}%`}} title={`Доход: ${fmtCur(d.income)}`} />}
                  {d.expense>0 && <div className="bg-[var(--expense-color)]/50 w-full rounded-t-sm" style={{height:`${(d.expense/mv)*100}%`}} title={`Расход: ${fmtCur(d.expense)}`} />}
                </div>
              )})}
            </div>
            <div className="flex items-center gap-5 mt-3">
              <div className="flex items-center gap-1.5"><div className="w-3 h-2 bg-[var(--income-color)]/50 rounded-sm" /><span className="text-[11px] text-muted-foreground">Доходы</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-2 bg-[var(--expense-color)]/50 rounded-sm" /><span className="text-[11px] text-muted-foreground">Расходы</span></div>
            </div>
          </section>
        )}

        {/* Section divider */}
        <div className="section-divider" />

        {/* Transactions */}
        <section className="animate-fade-in-up" style={{animationDelay:'0.25s'}}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-base tracking-tight text-foreground">Транзакции</h2>
              <span className="text-[11px] font-medium text-muted-foreground bg-secondary px-2.5 py-0.5 rounded-full">{filteredTransactions.length} {pluralize(filteredTransactions.length)}</span>
            </div>
          </div>
          <Tabs value={filterTab} onValueChange={v => setFilterTab(v as 'all'|'income'|'expense')} className="mb-4">
            <TabsList className="w-full bg-secondary rounded-2xl p-1 h-10 border border-border">
              <TabsTrigger value="all" className="flex-1 text-[11px] font-medium rounded-xl data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground transition-all">Все</TabsTrigger>
              <TabsTrigger value="income" className="flex-1 text-[11px] font-medium rounded-xl data-[state=active]:bg-[var(--income-bg)] data-[state=active]:text-[var(--income-color)] data-[state=active]:shadow-sm text-muted-foreground transition-all">Доходы</TabsTrigger>
              <TabsTrigger value="expense" className="flex-1 text-[11px] font-medium rounded-xl data-[state=active]:bg-[var(--expense-bg)] data-[state=active]:text-[var(--expense-color)] data-[state=active]:shadow-sm text-muted-foreground transition-all">Расходы</TabsTrigger>
            </TabsList>
          </Tabs>

          {isLoading && <div className="space-y-3">{Array.from({length:5}).map((_,i)=>(<div key={i} className="flex items-center gap-3 py-3.5 px-3 animate-pulse"><div className="w-10 h-10 bg-secondary rounded-xl" /><div className="flex-1 space-y-2"><div className="h-4 bg-secondary rounded-lg w-3/4" /><div className="h-3 bg-secondary rounded-lg w-1/2" /></div><div className="h-4 bg-secondary rounded-lg w-20" /></div>))}</div>}

          {!isLoading && filteredTransactions.length === 0 && (
            <div className="text-center py-16 space-y-4">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-secondary flex items-center justify-center"><Wallet className="w-7 h-7 text-muted-foreground/50" /></div>
              <p className="font-semibold text-base text-foreground/60">Нет транзакций</p>
              <p className="text-sm text-muted-foreground">Добавьте первую транзакцию</p>
              <button onClick={() => { resetAddForm(); setIsDialogOpen(true) }} className="inline-flex items-center gap-2 liquid-glass-btn px-5 py-2.5 font-semibold text-sm rounded-2xl"><Plus className="w-4 h-4" /> Добавить</button>
            </div>
          )}

          {!isLoading && Object.entries(groupedTransactions).map(([dateKey, txs]) => (
            <div key={dateKey}>
              <div className="sticky top-[60px] z-10 py-2"><span className="text-[11px] font-medium text-muted-foreground tracking-wide bg-background/80 backdrop-blur-sm px-2 py-1 rounded-lg">{fmtFullDate(txs[0].date)}</span></div>
              <div>{txs.map(t => <TransactionRow key={t.id} t={t} onEdit={openEditDialog} onDelete={setDeleteTarget} feeMap={feeMap} iconMap={iconMap} />)}</div>
            </div>
          ))}
        </section>
      </main>

      {/* FAB */}
      <button onClick={() => { resetAddForm(); setIsDialogOpen(true) }} className="fixed bottom-6 right-6 h-14 w-14 liquid-glass-btn flex items-center justify-center shadow-lg sm:hidden z-30 rounded-2xl"><Plus className="w-6 h-6" /></button>

      {/* Scroll-to-top */}
      {showScrollTop && <button onClick={() => window.scrollTo({top:0,behavior:'smooth'})} className="fixed bottom-6 left-6 p-3 liquid-glass-sm rounded-2xl z-30 transition-colors hover:bg-secondary/50"><ChevronLeft className="w-4 h-4 rotate-90 text-muted-foreground" /></button>}

      {/* Add Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="liquid-glass-dialog sm:max-w-md max-h-[85vh] overflow-y-auto rounded-3xl">
          <DialogHeader><DialogTitle className="font-semibold text-base tracking-tight text-foreground">Новая транзакция</DialogTitle></DialogHeader>
          <TransactionForm type={formType} setType={setFormType} amount={formAmount} setAmount={setFormAmount} description={formDescription} setDescription={setFormDescription} date={formDate} setDate={setFormDate} taxRate={formTaxRate} setTaxRate={setFormTaxRate} platforms={formPlatforms} togglePlatform={togglePlatform} setPlatformReviewCount={setPlatformReviewCount} category={formCategory} setCategory={setFormCategory} isSubmitting={isSubmitting} onSubmit={handleAddSubmit} submitLabel="Добавить" platformsList={platforms} feeMap={feeMap} iconMap={iconMap} />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="liquid-glass-dialog sm:max-w-md max-h-[85vh] overflow-y-auto rounded-3xl">
          <DialogHeader><DialogTitle className="font-semibold text-base tracking-tight text-foreground">Редактировать</DialogTitle></DialogHeader>
          <TransactionForm type={editType} setType={(v) => { setEditType(v); if (v==='expense') { setEditTaxRate('none'); setEditPlatforms(platforms.map(p=>({name:p.name,reviewCount:0}))) } }} amount={editAmount} setAmount={setEditAmount} description={editDescription} setDescription={setEditDescription} date={editDate} setDate={setEditDate} taxRate={editTaxRate} setTaxRate={setEditTaxRate} platforms={editPlatforms} togglePlatform={toggleEditPlatform} setPlatformReviewCount={setEditPlatformReviewCount} category={editCategory} setCategory={setEditCategory} isSubmitting={isSubmitting} onSubmit={handleEditSubmit} submitLabel="Сохранить" platformsList={platforms} feeMap={feeMap} iconMap={iconMap} />
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className="liquid-glass-dialog rounded-3xl">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-2xl bg-[var(--expense-bg)] flex items-center justify-center"><Trash2 className="w-5 h-5 text-[var(--expense-color)]" /></div>
              <AlertDialogTitle className="font-semibold tracking-tight text-foreground">Удалить?</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-muted-foreground">Это действие нельзя отменить</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="font-semibold rounded-2xl bg-secondary text-foreground/60 hover:bg-secondary/80 hover:text-foreground">Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-[var(--expense-color)] text-white hover:bg-[var(--expense-color)]/80 font-semibold rounded-2xl">Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Settings Dialog */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="liquid-glass-dialog sm:max-w-md max-h-[85vh] overflow-y-auto rounded-3xl">
          <DialogHeader><DialogTitle className="font-semibold text-base tracking-tight text-foreground">Настройки площадок</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Управляйте ценами за отзыв на каждой площадке. Изменения сохраняются автоматически.</p>
            <div className="space-y-2">
              {platforms.map(p => (
                <div key={p.name} className="flex items-center gap-2 liquid-glass rounded-2xl p-3">
                  {p.icon && <PlatformIcon name={p.name} size={24} iconMap={iconMap} />}
                  {!p.icon && <div className="w-6 h-6 rounded-lg bg-secondary flex items-center justify-center text-[10px] font-bold text-muted-foreground">{p.name[0]}</div>}
                  <span className="text-sm font-medium flex-1 truncate text-foreground/70">{p.name}</span>
                  <div className="liquid-stepper">
                    <button onClick={() => updatePlatformFee(p.name, Math.max(1, p.fee - 25))} className="liquid-stepper-btn"><MinusCircle /></button>
                    <input type="number" min="1" value={p.fee} onChange={e => updatePlatformFee(p.name, parseInt(e.target.value)||0)} className="liquid-stepper-value text-foreground" />
                    <button onClick={() => updatePlatformFee(p.name, p.fee + 25)} className="liquid-stepper-btn"><PlusCircle /></button>
                  </div>
                  <span className="text-[11px] text-muted-foreground font-medium">₽/отзыв</span>
                  <button onClick={() => removePlatform(p.name)} className="p-1.5 rounded-xl hover:bg-[var(--expense-bg)] text-muted-foreground hover:text-[var(--expense-color)] transition-colors" title="Удалить площадку"><MinusCircle className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <div className="liquid-glass rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2"><PlusCircle className="w-4 h-4 text-muted-foreground" /><span className="text-[11px] font-medium text-muted-foreground tracking-wide">Добавить площадку</span></div>
              <div className="flex items-center gap-2">
                <Input value={newPlatformName} onChange={e => setNewPlatformName(e.target.value)} placeholder="Название площадки" className="h-9 text-sm rounded-xl liquid-glass-input flex-1 text-foreground placeholder:text-muted-foreground/50" onKeyDown={e => { if (e.key==='Enter') addPlatform() }} />
                <div className="liquid-stepper">
                  <button type="button" className="liquid-stepper-btn" onClick={() => setNewPlatformFee(String(Math.max(1, (parseInt(newPlatformFee)||0) - 25)))}><MinusCircle /></button>
                  <input type="number" min="1" value={newPlatformFee} onChange={e => setNewPlatformFee(e.target.value)} className="liquid-stepper-value text-foreground" placeholder="₽" onKeyDown={e => { if (e.key==='Enter') addPlatform() }} />
                  <button type="button" className="liquid-stepper-btn" onClick={() => setNewPlatformFee(String((parseInt(newPlatformFee)||0) + 25))}><PlusCircle /></button>
                </div>
                <Button onClick={addPlatform} className="h-9 px-4 liquid-glass-btn font-semibold rounded-xl text-[12px]"><Plus className="w-3.5 h-3.5 mr-1" /> Добавить</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="liquid-glass-dialog sm:max-w-md max-h-[85vh] overflow-y-auto rounded-3xl">
          <DialogHeader><DialogTitle className="font-semibold text-base tracking-tight text-foreground">История по месяцам</DialogTitle></DialogHeader>
          {monthHistory.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-secondary flex items-center justify-center"><BarChart3 className="w-6 h-6 text-muted-foreground/50" /></div>
              <p className="text-sm text-muted-foreground">Пока нет данных</p>
            </div>
          ) : (
            <div className="space-y-2">
              {monthHistory.map(h => {
                // Calculate net income: gross - tax - executor fees
                let netIncome = h.grossIncome
                netIncome -= h.tax
                for (const [name, data] of Object.entries(h.platformFees)) {
                  netIncome -= (feeMap[name] || 0) * data.reviewCount
                }
                const net = netIncome - h.expense
                const isSelected = h.month === selectedMonth && h.year === selectedYear
                const maxVal = Math.max(...monthHistory.map(m => {
                  let ni = m.grossIncome - m.tax
                  for (const [n, d] of Object.entries(m.platformFees)) ni -= (feeMap[n] || 0) * d.reviewCount
                  return Math.max(ni, m.expense)
                }), 1)
                return (
                  <button
                    key={`${h.year}-${h.month}`}
                    onClick={() => { setSelectedMonth(h.month); setSelectedYear(h.year); setIsHistoryOpen(false) }}
                    className={`w-full text-left liquid-glass rounded-2xl p-3.5 transition-all duration-200 ${isSelected ? 'ring-2 ring-primary/40 !bg-primary/5' : 'hover:bg-secondary/30'}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-sm font-semibold ${isSelected ? 'text-primary' : 'text-foreground/80'}`}>{MONTHS_RU[h.month - 1]} {h.year}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] font-medium tabular-nums text-[var(--income-color)]">+{fmtCur(netIncome)}</span>
                        <span className="text-[11px] font-medium tabular-nums text-[var(--expense-color)]">−{fmtCur(h.expense)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 h-3">
                      <div className="flex-1 flex items-center h-full">
                        <div className="bg-[var(--income-color)]/40 h-full rounded-l-md transition-all duration-500" style={{width: `${(netIncome / maxVal) * 100}%`, minWidth: netIncome > 0 ? '4px' : '0'}} />
                      </div>
                      <div className="flex-1 flex items-center justify-end h-full">
                        <div className="bg-[var(--expense-color)]/40 h-full rounded-r-md transition-all duration-500" style={{width: `${(h.expense / maxVal) * 100}%`, minWidth: h.expense > 0 ? '4px' : '0'}} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[10px] text-muted-foreground tabular-nums">{h.count} {h.count === 1 ? 'запись' : h.count < 5 ? 'записи' : 'записей'}</span>
                      <span className={`text-[11px] font-semibold tabular-nums ${net >= 0 ? 'text-gradient-blue' : 'text-[var(--expense-color)]'}`}>{net >= 0 ? '+' : ''}{fmtCur(net)}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
