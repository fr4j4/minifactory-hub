'use client';
/**
 * Kit de componentes accesibles (Radix): Dialog, Select, Tabs, Dropdown y Switch con el estilo de la app.
 * Conviven con las clases `.btn/.input/.card`; las pantallas se migran de a una.
 */
import * as Dialog from '@radix-ui/react-dialog';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { Check, ChevronDown, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/format';

/* ───────── Dialog ───────── */
export function ModalDialog({ open, onClose, title, children, wide, closeLabel }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; closeLabel: string }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/50 data-[state=open]:animate-fadeIn data-[state=closed]:animate-fadeOut" />
        {/* Radix desmonta este contenedor al terminar su animación: con fadeOut al cerrar, el contenido alcanza a salir */}
        <div className={cn('fixed inset-0 z-[91] flex items-end md:items-center justify-center p-0 md:p-4 pointer-events-none', !open && 'animate-fadeOut')}>
          <Dialog.Content aria-describedby={undefined} onOpenAutoFocus={(e) => { const f = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('input,select,textarea'); if (f) { e.preventDefault(); f.focus(); } }} className={cn('pointer-events-auto bg-[var(--card)] data-[state=open]:animate-rise data-[state=closed]:animate-fadeOut w-full rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto border border-slate-200 dark:border-slate-700 focus:outline-none', wide ? 'md:max-w-3xl' : 'md:max-w-lg')}>
            <div className="sticky top-0 bg-inherit flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-700 z-10">
              <Dialog.Title className="font-semibold">{title}</Dialog.Title>
              <Dialog.Close className="btn-ghost btn-sm !px-2.5" aria-label={closeLabel}><X className="h-4 w-4" /></Dialog.Close>
            </div>
            <div className="p-5">{children}</div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ───────── Select ───────── */
export function SelectField({ value, onValueChange, options, placeholder, label, testId }: { value: string; onValueChange: (v: string) => void; options: Array<{ value: string; label: string }>; placeholder?: string; label: string; testId?: string }) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger aria-label={label} data-testid={testId} className="input flex items-center justify-between gap-2 text-left">
        <SelectPrimitive.Value placeholder={placeholder} /><SelectPrimitive.Icon><ChevronDown className="h-4 w-4 opacity-60" aria-hidden /></SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content position="popper" sideOffset={4} className="z-[100] card p-1 shadow-2xl min-w-[var(--radix-select-trigger-width)] max-h-72 overflow-y-auto">
          <SelectPrimitive.Viewport>
            {options.map((o) => (
              <SelectPrimitive.Item key={o.value} value={o.value} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm cursor-pointer outline-none data-[highlighted]:bg-slate-100 dark:data-[highlighted]:bg-slate-800">
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText><SelectPrimitive.ItemIndicator><Check className="h-4 w-4" aria-hidden /></SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

/* ───────── Tabs (con contenido en la misma página) ───────── */
export function TabsPanel({ tabs, defaultValue, label }: { tabs: Array<{ value: string; label: string; content: ReactNode }>; defaultValue?: string; label: string }) {
  return (
    <TabsPrimitive.Root defaultValue={defaultValue ?? tabs[0]?.value}>
      <TabsPrimitive.List aria-label={label} className="flex flex-wrap gap-1 border-b border-[var(--line)] mb-4">
        {tabs.map((t) => <TabsPrimitive.Trigger key={t.value} value={t.value} className="px-3 py-2 text-sm rounded-t-lg border-b-2 border-transparent data-[state=active]:border-[var(--accent)] data-[state=active]:font-medium">{t.label}</TabsPrimitive.Trigger>)}
      </TabsPrimitive.List>
      {tabs.map((t) => <TabsPrimitive.Content key={t.value} value={t.value} className="focus:outline-none">{t.content}</TabsPrimitive.Content>)}
    </TabsPrimitive.Root>
  );
}

/* ───────── Dropdown ───────── */
export function DropdownMenu({ trigger, items, label }: { trigger: ReactNode; items: Array<{ key: string; label: string; onSelect: () => void; danger?: boolean }>; label: string }) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild><button type="button" className="btn-ghost btn-sm" aria-label={label}>{trigger}</button></Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={4} className="z-[100] card p-1 shadow-2xl min-w-[10rem]">
          {items.map((i) => <Dropdown.Item key={i.key} onSelect={i.onSelect} className={cn('rounded-lg px-3 py-2 text-sm cursor-pointer outline-none data-[highlighted]:bg-slate-100 dark:data-[highlighted]:bg-slate-800', i.danger && 'text-danger')}>{i.label}</Dropdown.Item>)}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

/* ───────── Switch ───────── */
export function Switch({ checked, onCheckedChange, label, testId }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string; testId?: string }) {
  return (
    <SwitchPrimitive.Root checked={checked} onCheckedChange={onCheckedChange} aria-label={label} data-testid={testId} className="relative h-6 w-11 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600 data-[state=checked]:bg-[var(--accent)] transition-colors">
      <SwitchPrimitive.Thumb className="block h-5 w-5 rounded-full bg-white shadow translate-x-0.5 data-[state=checked]:translate-x-[22px] transition-transform" />
    </SwitchPrimitive.Root>
  );
}
