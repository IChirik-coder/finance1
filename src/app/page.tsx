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
  TrendingUp, TrendingDown, BarChart3, Settings, PlusCircle, MinusCircle,
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
function invalidateCache() { cache.clear() }

// ─── Sub-components ───

const PlatformIcon = memo(function PlatformIcon({ name, size = 16, iconMap }: { name: string; size?: 12|16|20|24; iconMap: Record<string,string> }) {
  const icon = iconMap[name]; if (!icon) return null; return <img src={icon} alt={name} width={size} height={size} className="inline-block rounded" />
})

const TransactionRow = memo(function TransactionRow({ t, isBalanceHidden, onEdit, onDelete, feeMap, iconMap }: {
  t: Transaction; isBalanceHidden: boolean; onEdit: (t: Transaction) => void; onDelete: (id: string) => void; feeMap: Record<string,number>; iconMap: Record<string,string>
}) {
  const isIncome = t.type === 'income'
  const platforms = parsePlatforms(t.platforms)
  const catObj = EXPENSE_CATEGORIES.find(c => c.value === t.category)

  return (
    <div className="group flex items-center gap-3 py-3.5 px-3 rounded-2xl hover:bg-white/[0.03] transition-all duration-200">
      <div className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl ${
        isIncome ? 'bg-[var(--income-bg)] text-[var(--income-color)]' : 'bg-[var(--expense-bg)] text-[var(--expense-color)]'
      }`}>
        {isIncome ? <ArrowUpRight className="w-4.5 h-4.5" /> : catObj ? <span className="text-base">{catObj.icon}</span> : <ArrowDownRight className="w-4.5 h-4.5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm text-white/90 truncate">{t.description}</div>
        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
          {t.category && catObj && <span className="text-[11px] text-white/40">{catObj.label}</span>}
          {platforms.map((p, i) => (
            <span key={i} className="inline-flex items-center gap-1 bg-white/[0.06] text-white/50 text-[11px] px-2 py-0.5 rounded-full font-medium">
              <PlatformIcon name={p.name} size={12} iconMap={iconMap} />{p.reviewCount}
            </span>
          ))}
          {isIncome && t.taxRate && <span className="bg-brand/15 text-brand text-[11px] px-2 py-0.5 rounded-full font-medium">-{t.taxRate}%</span>}
          <span className="text-[11px] text-white/30">{fmtDate(t.date)}</span>
          {isIncome && platforms.length > 0 && <span className="text-[11px] text-white/30">(комиссии: {fmtCur(getFee(t, feeMap))})</span>}
        </div>
      </div>
      <div className="flex-shrink-0 flex items-center gap-2">
        <span className={`font-semibold text-sm tabular-nums ${isIncome ? 'text-[var(--income-color)]' : 'text-[var(--expense-color)]'}`}>
          {isBalanceHidden ? '•••' : `${isIncome ? '+' : '−'}${fmtCur(t.amount)}`}
        </span>
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button onClick={() => onEdit(t)} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"><Pencil className="w-3.5 h-3.5 text-white/40" /></button>
          <button onClick={() => onDelete(t.id)} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"><Trash2 className="w-3.5 h-3.5 text-white/40" /></button>
        </div>
      </div>
    </div>
  )
})

const StatCard = memo(function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="glass-pill rounded-2xl p-4 space-y-1.5 glass-hover">
      <div className="flex items-center gap-2"><span className="text-brand">{icon}</span><span className="text-[11px] font-medium text-white/40 tracking-wide">{label}</span></div>
      <div className="font-semibold text-lg tabular-nums text-white/90">{value}</div>
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
      <div className="flex bg-white/[0.04] rounded-2xl p-1 gap-1">
        <button type="button" onClick={() => setType('income')} className={`flex-1 h-10 text-sm font-semibold rounded-xl transition-all duration-200 ${isIncome ? 'bg-[var(--income-bg)] text-[var(--income-color)] border border-[var(--income-color)]/20' : 'text-white/40 hover:text-white/60'}`}>Доход</button>
        <button type="button" onClick={() => { setType('expense'); setTaxRate('none') }} className={`flex-1 h-10 text-sm font-semibold rounded-xl transition-all duration-200 ${!isIncome ? 'bg-[var(--expense-bg)] text-[var(--expense-color)] border border-[var(--expense-color)]/20' : 'text-white/40 hover:text-white/60'}`}>Расход</button>
      </div>
      {/* Amount */}
      <div className="relative">
        <Input type="number" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} className="text-3xl font-semibold h-16 pr-12 rounded-2xl bg-white/[0.04] border-white/[0.06] backdrop-blur-sm tabular-nums text-white" min="0" step="any" />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xl font-semibold text-white/30">₽</span>
      </div>
      {/* Category */}
      {!isIncome && (
        <div>
          <label className="text-[11px] font-medium text-white/40 mb-2 block tracking-wide">Категория</label>
          <div className="grid grid-cols-4 gap-2">
            {EXPENSE_CATEGORIES.map(c => (
              <button key={c.value} type="button" onClick={() => setCategory(c.value)} className={`flex flex-col items-center gap-1 p-2.5 text-[11px] rounded-2xl transition-all duration-200 ${category===c.value ? 'bg-[var(--expense-bg)] text-[var(--expense-color)] font-semibold border border-[var(--expense-color)]/20' : 'bg-white/[0.03] text-white/40 hover:bg-white/[0.06]'}`}>
                <span className="text-lg">{c.icon}</span><span>{c.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {/* Platforms */}
      {isIncome && (
        <div>
          <label className="text-[11px] font-medium text-white/40 mb-2 block tracking-wide">Площадки</label>
          <div className="grid grid-cols-3 gap-2">
            {platformsList.map(p => {
              const sel = platforms.find(pl => pl.name === p.name && pl.reviewCount > 0)
              return (
                <button key={p.name} type="button" onClick={() => togglePlatform(p.name)} className={`flex items-center gap-1.5 p-2.5 text-[11px] rounded-2xl transition-all duration-200 ${sel ? 'bg-[var(--income-bg)] text-[var(--income-color)] font-semibold border border-[var(--income-color)]/20' : 'bg-white/[0.03] text-white/40 hover:bg-white/[0.06]'}`}>
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
          <label className="text-[11px] font-medium text-white/40 tracking-wide">Количество отзывов</label>
          {selectedPlatforms.map(p => (
            <div key={p.name} className="flex items-center gap-2 bg-white/[0.03] rounded-2xl p-3 backdrop-blur-sm">
              <PlatformIcon name={p.name} size={20} iconMap={iconMap} />
              <span className="text-xs font-medium flex-shrink-0 text-white/70">{p.name}</span>
              <Input type="number" min="1" value={p.reviewCount} onChange={e => setPlatformReviewCount(p.name, parseInt(e.target.value)||0)} className="h-8 w-20 text-sm rounded-xl bg-white/[0.04] border-white/[0.06] tabular-nums text-white" />
              <span className="text-[11px] text-white/30 tabular-nums">{feeMap[p.name]||0}₽ × {p.reviewCount} = {((feeMap[p.name]||0)*p.reviewCount)}₽</span>
              <button type="button" onClick={() => setPlatformReviewCount(p.name, 0)} className="ml-auto p-1 rounded-lg hover:bg-white/10 transition-colors"><X className="w-3.5 h-3.5 text-white/40" /></button>
            </div>
          ))}
        </div>
      )}
      {/* Tax */}
      {isIncome && (
        <div>
          <label className="text-[11px] font-medium text-white/40 mb-2 block tracking-wide">Налоговый вычет</label>
          <div className="flex bg-white/[0.04] rounded-2xl p-1 gap-1">
            {(['none','4','6'] as const).map(rate => (
              <button key={rate} type="button" onClick={() => setTaxRate(rate)} className={`flex-1 h-10 text-sm font-semibold rounded-xl transition-all duration-200 ${taxRate===rate ? (rate==='none' ? 'bg-white/10 text-white border border-white/10' : 'bg-brand text-white shadow-lg shadow-brand/20') : 'text-white/40 hover:text-white/60'}`}>
                {rate==='none' ? 'Без вычета' : `${rate}%`}
              </button>
            ))}
          </div>
        </div>
      )}
      {/* Preview */}
      {isIncome && numAmount > 0 && (
        <div className="glass-accent rounded-2xl p-4 space-y-2.5">
          <div className="flex justify-between text-sm"><span className="text-white/40">Сумма</span><span className="font-medium tabular-nums text-white/80">{fmtFull(numAmount)}</span></div>
          {totalTax > 0 && <div className="flex justify-between text-sm"><span className="text-white/40">Налог</span><span className="font-medium text-[var(--expense-color)] tabular-nums">−{fmtFull(totalTax)}</span></div>}
          {totalExecutorFee > 0 && <div className="flex justify-between text-sm"><span className="text-white/40">Исполнители</span><span className="font-medium text-[var(--expense-color)] tabular-nums">−{fmtFull(totalExecutorFee)}</span></div>}
          <Separator className="bg-white/5" />
          <div className="flex justify-between text-sm"><span className="font-semibold text-white/60">К выдаче</span><span className="font-bold text-lg text-[var(--income-color)] tabular-nums">{fmtFull(netAmount)}</span></div>
        </div>
      )}
      {/* Description & Date */}
      <div><label className="text-[11px] font-medium text-white/40 mb-1.5 block tracking-wide">Описание</label><Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Например: Зарплата за январь" className="rounded-2xl bg-white/[0.04] border-white/[0.06] backdrop-blur-sm text-white placeholder:text-white/20" /></div>
      <div><label className="text-[11px] font-medium text-white/40 mb-1.5 block tracking-wide">Дата</label><Input type="date" value={date} onChange={e => setDate(e.target.value)} className="rounded-2xl bg-white/[0.04] border-white/[0.06] backdrop-blur-sm text-white" /></div>
      {/* Submit */}
      <Button onClick={onSubmit} disabled={isSubmitting} className={`w-full h-12 font-semibold rounded-2xl text-sm transition-all duration-200 ${isIncome ? 'bg-[var(--income-color)] text-white hover:bg-[var(--income-color)]/80 shadow-lg shadow-[var(--income-color)]/20' : 'bg-[var(--expense-color)] text-white hover:bg-[var(--expense-color)]/80 shadow-lg shadow-[var(--expense-color)]/20'}`}>
        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : submitLabel}
      </Button>
    </div>
  )
}

// ─── Main ───

export default function Home() {
  const now = new Date()

  const [platforms, setPlatforms] = useState<PlatformConfig[]>(DEFAULT_PLATFORMS)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [newPlatformName, setNewPlatformName] = useState('')
  const [newPlatformFee, setNewPlatformFee] = useState('25')

  useEffect(() => { setPlatforms(loadPlatforms()) }, [])

  const feeMap = useMemo(() => buildFeeMap(platforms), [platforms])
  const iconMap = useMemo(() => buildIconMap(platforms), [platforms])

  const updatePlatformFee = useCallback((name: string, fee: number) => { setPlatforms(prev => { const u = prev.map(p => p.name===name?{...p,fee}:p); savePlatforms(u); return u }) }, [])
  const removePlatform = useCallback((name: string) => { setPlatforms(prev => { const u = prev.filter(p => p.name!==name); savePlatforms(u); return u }) }, [])
  const addPlatform = useCallback(() => { const t = newPlatformName.trim(); if (!t) { toast.error('Введите название площадки'); return } if (platforms.some(p => p.name.toLowerCase()===t.toLowerCase())) { toast.error('Такая площадка уже есть'); return } const f = parseInt(newPlatformFee)||0; if (f<=0) { toast.error('Укажите цену больше 0'); return } setPlatforms(prev => { const u = [...prev, {name:t,fee:f,icon:''}]; savePlatforms(u); return u }); setNewPlatformName(''); setNewPlatformFee('25'); toast.success(`Площадка «${t}» добавлена`) }, [newPlatformName, newPlatformFee, platforms])

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth()+1)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [filterTab, setFilterTab] = useState<'all'|'income'|'expense'>('all')
  const [isBalanceHidden, setIsBalanceHidden] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string|null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [showScrollTop, setShowScrollTop] = useState(false)

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

  const searchRef = useRef<HTMLInputElement>(null)
  const isFetchingRef = useRef(false)

  useEffect(() => { let rafId: number; const h = () => { if (rafId) cancelAnimationFrame(rafId); rafId = requestAnimationFrame(() => setShowScrollTop(window.scrollY > 400)) }; window.addEventListener('scroll', h, {passive:true}); return () => { window.removeEventListener('scroll', h); cancelAnimationFrame(rafId) } }, [])

  const fetchTransactions = useCallback(async () => { if (isFetchingRef.current) return; isFetchingRef.current=true; setIsLoading(true); try { const d = await fetchCached(selectedMonth, selectedYear); setTransactions(d) } catch { toast.error('Ошибка загрузки') } finally { setIsLoading(false); isFetchingRef.current=false } }, [selectedMonth, selectedYear])
  useEffect(() => { fetchTransactions() }, [fetchTransactions])

  const togglePlatform = useCallback((name: string) => { setFormPlatforms(prev => prev.map(p => p.name===name?{...p,reviewCount:p.reviewCount>0?0:1}:p)) }, [])
  const setPlatformReviewCount = useCallback((name: string, count: number) => { setFormPlatforms(prev => prev.map(p => p.name===name?{...p,reviewCount:count}:p)) }, [])
  const toggleEditPlatform = useCallback((name: string) => { setEditPlatforms(prev => prev.map(p => p.name===name?{...p,reviewCount:p.reviewCount>0?0:1}:p)) }, [])
  const setEditPlatformReviewCount = useCallback((name: string, count: number) => { setEditPlatforms(prev => prev.map(p => p.name===name?{...p,reviewCount:count}:p)) }, [])

  const openEditDialog = useCallback((t: Transaction) => { setEditId(t.id); setEditType(t.type); setEditAmount(String(t.amount)); setEditDescription(t.description); setEditDate(format(new Date(t.date),'yyyy-MM-dd')); setEditTaxRate(t.taxRate?String(t.taxRate):'none'); setEditCategory(t.category||'other'); const pp = parsePlatforms(t.platforms); setEditPlatforms(platforms.map(p => { const f = pp.find(x => x.name===p.name); return {name:p.name, reviewCount:f?f.reviewCount:0} })); setIsEditDialogOpen(true) }, [platforms])

  const validateForm = useCallback((mode: 'add'|'edit'): string|null => { const a = mode==='add'?formAmount:editAmount; const d = mode==='add'?formDescription:editDescription; if (!parseFloat(a)||parseFloat(a)<=0) return 'Укажите сумму'; if (!d.trim()) return 'Укажите описание'; return null }, [formAmount, formDescription, editAmount, editDescription])

  const resetAddForm = useCallback(() => { setFormType('income'); setFormAmount(''); setFormDescription(''); setFormDate(format(new Date(),'yyyy-MM-dd')); setFormTaxRate('none'); setFormPlatforms(platforms.map(p => ({name:p.name,reviewCount:0}))); setFormCategory('other') }, [platforms])

  const handleAddSubmit = useCallback(async () => { const e = validateForm('add'); if (e) { toast.error(e); return } setIsSubmitting(true); try { const sp = formPlatforms.filter(p => p.reviewCount>0); const r = await fetch('/api/transactions', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ type:formType, amount:parseFloat(formAmount), description:formDescription, date:formDate||new Date().toISOString(), taxRate:formTaxRate==='none'?null:parseInt(formTaxRate), platforms:formType==='income'&&sp.length>0?sp:null, category:formType==='expense'?formCategory:null }) }); if (!r.ok) throw new Error(); invalidateCache(); await fetchTransactions(); setIsDialogOpen(false); resetAddForm(); toast.success('Транзакция добавлена') } catch { toast.error('Ошибка при добавлении') } finally { setIsSubmitting(false) } }, [formType,formAmount,formDescription,formDate,formTaxRate,formPlatforms,formCategory,validateForm,fetchTransactions,resetAddForm])

  const handleEditSubmit = useCallback(async () => { const e = validateForm('edit'); if (e) { toast.error(e); return } setIsSubmitting(true); try { const sp = editPlatforms.filter(p => p.reviewCount>0); const r = await fetch('/api/transactions', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ id:editId, type:editType, amount:parseFloat(editAmount), description:editDescription, date:editDate||new Date().toISOString(), taxRate:editTaxRate==='none'?null:parseInt(editTaxRate), platforms:editType==='income'&&sp.length>0?sp:null, category:editType==='expense'?editCategory:null }) }); if (!r.ok) throw new Error(); invalidateCache(); await fetchTransactions(); setIsEditDialogOpen(false); toast.success('Транзакция обновлена') } catch { toast.error('Ошибка при обновлении') } finally { setIsSubmitting(false) } }, [editId,editType,editAmount,editDescription,editDate,editTaxRate,editPlatforms,editCategory,validateForm,fetchTransactions])

  const handleDelete = useCallback(async () => { if (!deleteTarget) return; try { const r = await fetch(`/api/transactions?id=${deleteTarget}`,{method:'DELETE'}); if (!r.ok) throw new Error(); invalidateCache(); await fetchTransactions(); setDeleteTarget(null); toast.success('Транзакция удалена') } catch { toast.error('Ошибка при удалении') } }, [deleteTarget, fetchTransactions])

  const goToPrevMonth = useCallback(() => { setSelectedMonth(prev => { if (prev===1) { setSelectedYear(y=>y-1); return 12 } return prev-1 }) }, [])
  const goToNextMonth = useCallback(() => { setSelectedMonth(prev => { if (prev===12) { setSelectedYear(y=>y+1); return 1 } return prev+1 }) }, [])
  const goToCurrentMonth = useCallback(() => { const n = new Date(); setSelectedMonth(n.getMonth()+1); setSelectedYear(n.getFullYear()) }, [])

  const stats = useMemo(() => {
    const inc = transactions.filter(t => t.type==='income'); const exp = transactions.filter(t => t.type==='expense')
    const totalIncome = inc.reduce((s,t) => s+getNet(t,feeMap),0); const totalGrossIncome = inc.reduce((s,t)=>s+t.amount,0)
    const totalExecutorFee = inc.reduce((s,t)=>s+getFee(t,feeMap),0); const totalTax = inc.reduce((s,t)=>s+getTax(t),0)
    const totalExpense = exp.reduce((s,t)=>s+t.amount,0); const balance = totalIncome-totalExpense
    const incomeCount = inc.length; const expenseCount = exp.length
    const avgIncome = incomeCount?totalIncome/incomeCount:0; const avgExpense = expenseCount?totalExpense/expenseCount:0
    const maxIncome = incomeCount?Math.max(...inc.map(t=>getNet(t,feeMap))):0; const maxExpense = expenseCount?Math.max(...exp.map(t=>t.amount)):0
    const expenseRatio = totalIncome>0?(totalExpense/totalIncome)*100:0
    const categoryBreakdown: Record<string,number> = {}; for (const t of exp) { if (t.category) categoryBreakdown[t.category]=(categoryBreakdown[t.category]||0)+t.amount }
    const dailyData: Record<number,{income:number;expense:number}> = {}; for (const t of transactions) { const d=new Date(t.date).getDate(); if (!dailyData[d]) dailyData[d]={income:0,expense:0}; if (t.type==='income') dailyData[d].income+=getNet(t,feeMap); else dailyData[d].expense+=t.amount }
    const maxDaily = Math.max(...Object.values(dailyData).flatMap(d=>[d.income,d.expense]),0)
    return { totalIncome,totalGrossIncome,totalExecutorFee,totalTax,totalExpense,balance,incomeCount,expenseCount,avgIncome,avgExpense,maxIncome,maxExpense,expenseRatio,categoryBreakdown,dailyData,maxDaily }
  }, [transactions, feeMap])

  const filteredTransactions = useMemo(() => { let f = transactions; if (filterTab==='income') f=f.filter(t=>t.type==='income'); if (filterTab==='expense') f=f.filter(t=>t.type==='expense'); if (searchQuery.trim()) { const q=searchQuery.toLowerCase(); f=f.filter(t=>t.description.toLowerCase().includes(q)||(t.category&&t.category.toLowerCase().includes(q))||String(t.amount).includes(q)) } return f }, [transactions, filterTab, searchQuery])
  const groupedTransactions = useMemo(() => groupByDate(filteredTransactions), [filteredTransactions])
  const daysInMonth = useMemo(() => getDaysInMonth(new Date(selectedYear, selectedMonth-1)), [selectedMonth, selectedYear])
  const chartDays = useMemo(() => Array.from({length:daysInMonth},(_,i)=>i+1), [daysInMonth])
  const isCurrentMonth = selectedMonth===now.getMonth()+1 && selectedYear===now.getFullYear()

  return (
    <div className="min-h-screen">
      {/* ── Floating glass nav ── */}
      <nav className="fixed top-3 left-3 right-3 z-50">
        <div className="glass-heavy rounded-2xl max-w-3xl mx-auto px-4 h-12 flex items-center justify-between pill-press">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#F97316] to-[#3B82F6] flex items-center justify-center">
              <span className="text-white text-[11px] font-bold">₽</span>
            </div>
            <span className="font-semibold text-sm tracking-tight text-white/90">Финансы</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setIsSettingsOpen(true)} className="p-2 rounded-xl hover:bg-white/5 transition-colors" title="Настройки"><Settings className="w-[18px] h-[18px] text-white/40" /></button>
            <button onClick={() => { setShowSearch(!showSearch); if (!showSearch) setTimeout(() => searchRef.current?.focus(), 100) }} className="p-2 rounded-xl hover:bg-white/5 transition-colors">
              {showSearch ? <X className="w-[18px] h-[18px] text-white/40" /> : <Search className="w-[18px] h-[18px] text-white/40" />}
            </button>
            <button onClick={() => { resetAddForm(); setIsDialogOpen(true) }} className="p-2 rounded-xl bg-[var(--income-color)] text-white hover:bg-[var(--income-color)]/80 transition-colors shadow-lg shadow-[var(--income-color)]/20">
              <Plus className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>
      </nav>

      {/* Search */}
      {showSearch && (
        <div className="fixed top-[60px] left-3 right-3 z-40 animate-[slideDown_0.25s_cubic-bezier(0.25,0.46,0.45,0.94)]">
          <div className="glass-heavy rounded-2xl max-w-3xl mx-auto px-4 py-3 flex items-center gap-2">
            <Search className="w-4 h-4 text-white/30 flex-shrink-0" />
            <input ref={searchRef} type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Поиск транзакций..." className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-white/25" />
            {searchQuery && <button onClick={() => setSearchQuery('')} className="p-1 rounded-lg hover:bg-white/10 transition-colors"><X className="w-4 h-4 text-white/40" /></button>}
          </div>
        </div>
      )}

      {/* ── Main ── */}
      <main className="max-w-3xl mx-auto px-4 pt-20 pb-28">
        {/* Hero */}
        <section className="mb-8">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-6">
            <button onClick={goToPrevMonth} className="p-2.5 rounded-xl glass-pill hover:bg-white/5 transition-colors pill-press"><ChevronLeft className="w-4 h-4 text-white/40" /></button>
            <div className="flex items-center gap-3">
              <h1 className="font-semibold text-lg tracking-tight text-white/90">{MONTHS_RU[selectedMonth-1]} {selectedYear}</h1>
              {!isCurrentMonth && <button onClick={goToCurrentMonth} className="text-[11px] font-medium text-brand bg-brand/10 px-3 py-1 rounded-full hover:bg-brand/15 transition-colors pill-press">Сегодня</button>}
            </div>
            <button onClick={goToNextMonth} className="p-2.5 rounded-xl glass-pill hover:bg-white/5 transition-colors pill-press"><ChevronRight className="w-4 h-4 text-white/40" /></button>
          </div>

          {/* Balance card */}
          <div className="glass-accent rounded-3xl p-6 mb-5 glass-hover">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-medium text-white/40 tracking-wide uppercase">Баланс</span>
              <button onClick={() => setIsBalanceHidden(!isBalanceHidden)} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">{isBalanceHidden ? <EyeOff className="w-4 h-4 text-white/30" /> : <Eye className="w-4 h-4 text-white/30" />}</button>
            </div>
            <div className="font-bold text-5xl sm:text-6xl tracking-tight tabular-nums text-gradient">
              {isBalanceHidden ? '•••' : fmtCur(stats.balance)}
            </div>
          </div>

          {/* Income / Expense */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="glass-pill rounded-2xl p-4 glass-hover">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-8 h-8 rounded-xl bg-[var(--income-bg)] flex items-center justify-center"><ArrowUpRight className="w-4 h-4 text-[var(--income-color)]" /></div>
                <span className="text-[11px] font-medium text-white/40 tracking-wide">Доходы</span>
              </div>
              <div className="font-semibold text-lg tabular-nums text-[var(--income-color)]">{isBalanceHidden ? '•••' : fmtCur(stats.totalIncome)}</div>
              {!isBalanceHidden && stats.totalGrossIncome !== stats.totalIncome && <div className="text-[11px] text-white/30 mt-0.5 tabular-nums">Гросс {fmtCur(stats.totalGrossIncome)}{stats.totalTax>0&&` · Налог ${fmtCur(stats.totalTax)}`}{stats.totalExecutorFee>0&&` · Исполнители ${fmtCur(stats.totalExecutorFee)}`}</div>}
            </div>
            <div className="glass-pill rounded-2xl p-4 glass-hover">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-8 h-8 rounded-xl bg-[var(--expense-bg)] flex items-center justify-center"><ArrowDownRight className="w-4 h-4 text-[var(--expense-color)]" /></div>
                <span className="text-[11px] font-medium text-white/40 tracking-wide">Расходы</span>
              </div>
              <div className={`font-semibold text-lg tabular-nums ${isBalanceHidden ? '' : 'text-[var(--expense-color)]'}`}>{isBalanceHidden ? '•••' : fmtCur(stats.totalExpense)}</div>
            </div>
          </div>

          {/* Expense ratio */}
          {stats.totalIncome > 0 && !isBalanceHidden && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] font-medium"><span className="text-white/40">Расходы от доходов</span><span className="tabular-nums text-white/60">{stats.expenseRatio.toFixed(0)}%</span></div>
              <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${stats.expenseRatio>90?'bg-[var(--expense-color)]':stats.expenseRatio>70?'bg-orange-400':'bg-[var(--income-color)]'}`} style={{width:`${Math.min(stats.expenseRatio,100)}%`}} />
              </div>
            </div>
          )}
        </section>

        {/* Quick stats */}
        {transactions.length > 0 && (
          <section className="mb-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Макс. доход" value={isBalanceHidden ? '•••' : fmtCur(stats.maxIncome)} />
              <StatCard icon={<TrendingDown className="w-4 h-4" />} label="Макс. расход" value={isBalanceHidden ? '•••' : fmtCur(stats.maxExpense)} />
              <StatCard icon={<BarChart3 className="w-4 h-4" />} label="Средний доход" value={isBalanceHidden ? '•••' : fmtCur(stats.avgIncome)} />
              <StatCard icon={<BarChart3 className="w-4 h-4" />} label="Средний расход" value={isBalanceHidden ? '•••' : fmtCur(stats.avgExpense)} />
            </div>
          </section>
        )}

        {/* Daily chart */}
        {Object.keys(stats.dailyData).length > 1 && (
          <section className="mb-8 glass rounded-3xl p-5">
            <h3 className="text-[11px] font-medium text-white/40 tracking-wide uppercase mb-4">Активность по дням</h3>
            <div className="flex items-end gap-[2px] h-24">
              {chartDays.map(day => { const d = stats.dailyData[day]; if (!d) return <div key={day} className="flex-1 flex flex-col justify-end gap-[1px] min-w-0" />; const mv = stats.maxDaily||1; return (
                <div key={day} className="flex-1 flex flex-col justify-end gap-[1px] min-w-0">
                  {d.income>0 && <div className="bg-[var(--income-color)]/50 w-full rounded-t-sm" style={{height:`${(d.income/mv)*100}%`}} title={`Доход: ${fmtCur(d.income)}`} />}
                  {d.expense>0 && <div className="bg-[var(--expense-color)]/50 w-full rounded-t-sm" style={{height:`${(d.expense/mv)*100}%`}} title={`Расход: ${fmtCur(d.expense)}`} />}
                </div>
              )})}
            </div>
            <div className="flex items-center gap-5 mt-3">
              <div className="flex items-center gap-1.5"><div className="w-3 h-2 bg-[var(--income-color)]/50 rounded-sm" /><span className="text-[11px] text-white/30">Доходы</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-2 bg-[var(--expense-color)]/50 rounded-sm" /><span className="text-[11px] text-white/30">Расходы</span></div>
            </div>
          </section>
        )}

        {/* Categories */}
        {stats.totalExpense > 0 && !isBalanceHidden && Object.keys(stats.categoryBreakdown).length > 0 && (
          <section className="mb-8 glass rounded-3xl p-5 space-y-4">
            <h3 className="text-[11px] font-medium text-white/40 tracking-wide uppercase">Категории расходов</h3>
            {Object.entries(stats.categoryBreakdown).sort(([,a],[,b])=>b-a).map(([cat,amount]) => { const co = EXPENSE_CATEGORIES.find(c=>c.value===cat); const pct = stats.totalExpense>0?(amount/stats.totalExpense)*100:0; return (
              <div key={cat} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><span>{co?.icon}</span><span className="font-medium text-white/70">{co?.label||cat}</span></span><span className="font-semibold tabular-nums text-white/90">{fmtCur(amount)}</span></div>
                <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden"><div className="h-full bg-[var(--expense-color)]/50 rounded-full transition-all duration-500" style={{width:`${pct}%`}} /></div>
              </div>
            )})}
          </section>
        )}

        {/* Transactions */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-base tracking-tight text-white/90">Транзакции</h2>
              <span className="text-[11px] font-medium text-white/30 bg-white/[0.04] px-2.5 py-0.5 rounded-full">{filteredTransactions.length} {pluralize(filteredTransactions.length)}</span>
            </div>
          </div>
          <Tabs value={filterTab} onValueChange={v => setFilterTab(v as 'all'|'income'|'expense')} className="mb-4">
            <TabsList className="w-full bg-white/[0.04] rounded-2xl p-1 h-10 border border-white/[0.04]">
              <TabsTrigger value="all" className="flex-1 text-[11px] font-medium rounded-xl data-[state=active]:bg-white/10 data-[state=active]:text-white/80 data-[state=active]:shadow-sm text-white/30 transition-all">Все</TabsTrigger>
              <TabsTrigger value="income" className="flex-1 text-[11px] font-medium rounded-xl data-[state=active]:bg-[var(--income-bg)] data-[state=active]:text-[var(--income-color)] data-[state=active]:shadow-sm text-white/30 transition-all">Доходы</TabsTrigger>
              <TabsTrigger value="expense" className="flex-1 text-[11px] font-medium rounded-xl data-[state=active]:bg-[var(--expense-bg)] data-[state=active]:text-[var(--expense-color)] data-[state=active]:shadow-sm text-white/30 transition-all">Расходы</TabsTrigger>
            </TabsList>
          </Tabs>

          {isLoading && <div className="space-y-3">{Array.from({length:5}).map((_,i)=>(<div key={i} className="flex items-center gap-3 py-3.5 px-3 animate-pulse"><div className="w-10 h-10 bg-white/[0.04] rounded-xl" /><div className="flex-1 space-y-2"><div className="h-4 bg-white/[0.04] rounded-lg w-3/4" /><div className="h-3 bg-white/[0.04] rounded-lg w-1/2" /></div><div className="h-4 bg-white/[0.04] rounded-lg w-20" /></div>))}</div>}

          {!isLoading && filteredTransactions.length === 0 && (
            <div className="text-center py-16 space-y-4">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-white/[0.04] flex items-center justify-center"><Wallet className="w-7 h-7 text-white/20" /></div>
              <p className="font-semibold text-base text-white/60">Нет транзакций</p>
              <p className="text-sm text-white/30">{searchQuery ? 'Попробуйте изменить запрос' : 'Добавьте первую транзакцию'}</p>
              {!searchQuery && <button onClick={() => { resetAddForm(); setIsDialogOpen(true) }} className="inline-flex items-center gap-2 bg-[var(--income-color)] text-white px-5 py-2.5 font-semibold text-sm rounded-2xl hover:bg-[var(--income-color)]/80 transition-colors pill-press shadow-lg shadow-[var(--income-color)]/20"><Plus className="w-4 h-4" /> Добавить</button>}
            </div>
          )}

          {!isLoading && Object.entries(groupedTransactions).map(([dateKey, txs]) => (
            <div key={dateKey}>
              <div className="sticky top-[60px] z-10 py-2"><span className="text-[11px] font-medium text-white/30 tracking-wide bg-[#07070F]/80 backdrop-blur-sm px-2 py-1 rounded-lg">{fmtFullDate(txs[0].date)}</span></div>
              <div>{txs.map(t => <TransactionRow key={t.id} t={t} isBalanceHidden={isBalanceHidden} onEdit={openEditDialog} onDelete={setDeleteTarget} feeMap={feeMap} iconMap={iconMap} />)}</div>
            </div>
          ))}
        </section>
      </main>

      {/* FAB */}
      <button onClick={() => { resetAddForm(); setIsDialogOpen(true) }} className="fixed bottom-6 right-6 h-14 w-14 bg-[var(--income-color)] text-white flex items-center justify-center shadow-lg shadow-[var(--income-color)]/25 hover:bg-[var(--income-color)]/80 transition-all sm:hidden z-30 rounded-2xl pill-press"><Plus className="w-6 h-6" /></button>
      {showScrollTop && <button onClick={() => window.scrollTo({top:0,behavior:'smooth'})} className="fixed bottom-6 left-6 p-3 glass-pill rounded-2xl z-30 pill-press transition-colors hover:bg-white/5"><ChevronLeft className="w-4 h-4 rotate-90 text-white/40" /></button>}

      {/* Add Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="glass-dialog sm:max-w-md max-h-[85vh] overflow-y-auto rounded-3xl">
          <DialogHeader><DialogTitle className="font-semibold text-base tracking-tight text-white/90">Новая транзакция</DialogTitle></DialogHeader>
          <TransactionForm type={formType} setType={setFormType} amount={formAmount} setAmount={setFormAmount} description={formDescription} setDescription={setFormDescription} date={formDate} setDate={setFormDate} taxRate={formTaxRate} setTaxRate={setFormTaxRate} platforms={formPlatforms} togglePlatform={togglePlatform} setPlatformReviewCount={setPlatformReviewCount} category={formCategory} setCategory={setFormCategory} isSubmitting={isSubmitting} onSubmit={handleAddSubmit} submitLabel="Добавить" platformsList={platforms} feeMap={feeMap} iconMap={iconMap} />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="glass-dialog sm:max-w-md max-h-[85vh] overflow-y-auto rounded-3xl">
          <DialogHeader><DialogTitle className="font-semibold text-base tracking-tight text-white/90">Редактировать</DialogTitle></DialogHeader>
          <TransactionForm type={editType} setType={(v) => { setEditType(v); if (v==='expense') { setEditTaxRate('none'); setEditPlatforms(platforms.map(p=>({name:p.name,reviewCount:0}))) } }} amount={editAmount} setAmount={setEditAmount} description={editDescription} setDescription={setEditDescription} date={editDate} setDate={setEditDate} taxRate={editTaxRate} setTaxRate={setEditTaxRate} platforms={editPlatforms} togglePlatform={toggleEditPlatform} setPlatformReviewCount={setEditPlatformReviewCount} category={editCategory} setCategory={setEditCategory} isSubmitting={isSubmitting} onSubmit={handleEditSubmit} submitLabel="Сохранить" platformsList={platforms} feeMap={feeMap} iconMap={iconMap} />
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className="glass-dialog rounded-3xl">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-2xl bg-[var(--expense-bg)] flex items-center justify-center"><Trash2 className="w-5 h-5 text-[var(--expense-color)]" /></div>
              <AlertDialogTitle className="font-semibold tracking-tight text-white/90">Удалить?</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-white/40">Это действие нельзя отменить</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="font-semibold rounded-2xl bg-white/5 text-white/60 hover:bg-white/10 hover:text-white">Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-[var(--expense-color)] text-white hover:bg-[var(--expense-color)]/80 font-semibold rounded-2xl">Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Settings Dialog */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="glass-dialog sm:max-w-md max-h-[85vh] overflow-y-auto rounded-3xl">
          <DialogHeader><DialogTitle className="font-semibold text-base tracking-tight text-white/90">Настройки площадок</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-white/40">Управляйте ценами за отзыв на каждой площадке. Изменения сохраняются автоматически.</p>
            <div className="space-y-2">
              {platforms.map(p => (
                <div key={p.name} className="flex items-center gap-2 glass-pill rounded-2xl p-3">
                  {p.icon && <PlatformIcon name={p.name} size={24} iconMap={iconMap} />}
                  {!p.icon && <div className="w-6 h-6 rounded-lg bg-white/[0.06] flex items-center justify-center text-[10px] font-bold text-white/30">{p.name[0]}</div>}
                  <span className="text-sm font-medium flex-1 truncate text-white/70">{p.name}</span>
                  <div className="flex items-center gap-1.5">
                    <Input type="number" min="1" value={p.fee} onChange={e => updatePlatformFee(p.name, parseInt(e.target.value)||0)} className="h-8 w-20 text-sm rounded-xl bg-white/[0.04] border-white/[0.06] text-center font-semibold tabular-nums text-white" />
                    <span className="text-[11px] text-white/30 font-medium">₽/отзыв</span>
                  </div>
                  <button onClick={() => removePlatform(p.name)} className="p-1.5 rounded-xl hover:bg-[var(--expense-bg)] text-white/30 hover:text-[var(--expense-color)] transition-colors" title="Удалить площадку"><MinusCircle className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <div className="border border-dashed border-white/10 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2"><PlusCircle className="w-4 h-4 text-white/30" /><span className="text-[11px] font-medium text-white/30 tracking-wide">Добавить площадку</span></div>
              <div className="flex items-center gap-2">
                <Input value={newPlatformName} onChange={e => setNewPlatformName(e.target.value)} placeholder="Название площадки" className="h-9 text-sm rounded-xl bg-white/[0.04] border-white/[0.06] flex-1 text-white placeholder:text-white/20" onKeyDown={e => { if (e.key==='Enter') addPlatform() }} />
                <Input type="number" min="1" value={newPlatformFee} onChange={e => setNewPlatformFee(e.target.value)} className="h-9 w-20 text-sm rounded-xl bg-white/[0.04] border-white/[0.06] text-center text-white" placeholder="₽" onKeyDown={e => { if (e.key==='Enter') addPlatform() }} />
                <Button onClick={addPlatform} className="h-9 px-4 bg-[var(--income-color)] text-white hover:bg-[var(--income-color)]/80 font-semibold rounded-xl text-[12px] pill-press"><Plus className="w-3.5 h-3.5 mr-1" /> Добавить</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <style jsx>{`
        @keyframes slideDown {
          from { transform: translateY(-12px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
