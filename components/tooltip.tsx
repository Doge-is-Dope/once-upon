'use client';

import { cloneElement, useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';

type TooltipProps = {
  content: ReactNode;
  interactiveLabel?: string;
  children: ReactElement<{ id?: string; disabled?: boolean; 'aria-describedby'?: string }>;
};

export function Tooltip({ content, interactiveLabel, children }: TooltipProps) {
  const id = useId();
  const triggerId = children.props.id ?? `${id}-trigger`;
  const tooltipId = `${id}-tooltip`;
  const descriptionId = interactiveLabel ? `${id}-description` : tooltipId;
  const disabledTrigger = Boolean(content && children.props.disabled);
  const control = useRef<HTMLDivElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hovered = useRef(false);
  const [open, setOpen] = useState(false);
  const visible = Boolean(content) && open;
  const description = [children.props['aria-describedby'], content ? descriptionId : null].filter(Boolean).join(' ') || undefined;
  const cancelClose = () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  const show = () => { cancelClose(); if (content) setOpen(true); };
  const leave = () => {
    hovered.current = false;
    cancelClose();
    closeTimer.current = setTimeout(() => {
      if (!control.current?.contains(document.activeElement)) setOpen(false);
    }, 120);
  };

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  useLayoutEffect(() => {
    const tip = tooltip.current;
    const trigger = control.current;
    if (!visible || !tip || !trigger) return;
    // The native top layer avoids clipping; fixed positioning is the fallback.
    tip.showPopover?.();
    const bounds = trigger.getBoundingClientRect();
    const { width, height } = tip.getBoundingClientRect();
    const left = bounds.left + (bounds.width - width) / 2;
    const above = bounds.top - height - 8;
    tip.style.left = `${Math.max(16, Math.min(left, window.innerWidth - width - 16))}px`;
    tip.style.top = `${above >= 12 ? above : Math.max(12, Math.min(bounds.bottom + 8, window.innerHeight - height - 12))}px`;
    const dismiss = () => setOpen(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (tip.contains(document.activeElement)) {
        (disabledTrigger ? trigger : document.getElementById(triggerId))?.focus();
      }
      dismiss();
    };
    const onOutside = (event: PointerEvent) => { if (!trigger.contains(event.target as Node)) dismiss(); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onOutside);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      tip.hidePopover?.();
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onOutside);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [visible, content, disabledTrigger, triggerId]);

  return <div ref={control} className="tooltip-trigger" data-disabled={disabledTrigger || undefined}
    role={disabledTrigger ? 'group' : undefined}
    aria-labelledby={disabledTrigger ? triggerId : undefined}
    aria-describedby={disabledTrigger ? description : undefined}
    tabIndex={disabledTrigger ? 0 : undefined}
    onPointerEnter={(event) => { if (event.pointerType !== 'touch') { hovered.current = true; show(); } }}
    onPointerLeave={(event) => { if (event.pointerType !== 'touch') leave(); }}
    onPointerDown={(event) => { if (event.pointerType === 'touch') show(); }}
    onFocus={show}
    onBlur={(event) => { if (!hovered.current && !event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    {cloneElement(children, { id: triggerId, 'aria-describedby': description })}
    {content && <span ref={tooltip} id={tooltipId} className="tooltip-content" popover="manual" role={interactiveLabel ? 'dialog' : 'tooltip'} aria-label={interactiveLabel} data-open={visible}
      onToggle={(event) => { if (event.newState === 'closed') setOpen(false); }}
      onPointerEnter={() => { hovered.current = true; cancelClose(); }}
      onPointerLeave={(event) => { if (event.pointerType !== 'touch') leave(); }}>{interactiveLabel ? <span id={descriptionId}>{content}</span> : content}</span>}
  </div>;
}
