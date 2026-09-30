import React, {useEffect, useId, useRef, useState} from 'react';
import {
  SizeBox,
  SizeCaret,
  SizeField,
  SizeList,
  SizeOption,
  SizeTrigger,
} from './StoreStyles';

interface SizeChoice {
  id: string;
  label: string;
}

interface SizePickerProps {
  label: string;
  choices: readonly SizeChoice[];
  value: string;
  onChange: (id: string) => void;
}

// A select-only combobox. A native select cannot open from a caret outside
// its box, and most browsers draw its options in a platform menu that ignores
// the store's centering and font.
const SizePicker = React.memo(
  ({label, choices, value, onChange}: SizePickerProps) => {
    const listId = useId();
    const field = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    // Tracked by id: an inventory refresh can remove or reorder choices
    // while the list is open.
    const [activeId, setActiveId] = useState('');
    const selectedIndex = Math.max(
      0,
      choices.findIndex(choice => choice.id === value)
    );
    const activeIndex = choices.findIndex(choice => choice.id === activeId);
    const active = activeIndex === -1 ? selectedIndex : activeIndex;
    const expanded = open && choices.length > 0;
    const optionId = (index: number) => `${listId}-${index}`;

    useEffect(() => {
      if (!expanded) return;
      // Touch browsers do not always blur the trigger on a tap elsewhere.
      const dismiss = (event: PointerEvent) => {
        const target = event.target;
        if (!(target instanceof Node && field.current?.contains(target))) {
          setOpen(false);
        }
      };
      document.addEventListener('pointerdown', dismiss);
      return () => document.removeEventListener('pointerdown', dismiss);
    }, [expanded]);

    useEffect(() => {
      if (expanded) {
        document
          .getElementById(`${listId}-${active}`)
          ?.scrollIntoView({block: 'nearest'});
      }
    }, [expanded, active, listId]);

    const activate = (index: number) => setActiveId(choices[index]?.id ?? '');

    const show = (index: number) => {
      activate(index);
      setOpen(true);
      // Safari does not focus a clicked button, and the list takes its
      // keyboard input through the trigger.
      trigger.current?.focus();
    };

    const choose = (index: number) => {
      const choice = choices[index];
      if (choice) onChange(choice.id);
      setOpen(false);
    };

    const onKeyDown = (event: React.KeyboardEvent) => {
      const last = choices.length - 1;
      if (!expanded) {
        if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
          show(selectedIndex);
        } else if (event.key === 'Home') {
          show(0);
        } else if (event.key === 'End') {
          show(last);
        } else {
          return;
        }
      } else if (event.key === 'ArrowDown') {
        activate(Math.min(active + 1, last));
      } else if (event.key === 'ArrowUp') {
        activate(Math.max(active - 1, 0));
      } else if (event.key === 'Home') {
        activate(0);
      } else if (event.key === 'End') {
        activate(last);
      } else if (event.key === 'Enter' || event.key === ' ') {
        choose(active);
      } else if (event.key === 'Escape') {
        setOpen(false);
      } else {
        return;
      }
      // Also stops Enter and Space from clicking the trigger again.
      event.preventDefault();
    };

    return (
      <SizeField ref={field}>
        <SizeTrigger
          ref={trigger}
          type="button"
          role="combobox"
          aria-label={label}
          aria-controls={listId}
          aria-expanded={expanded}
          aria-haspopup="listbox"
          aria-activedescendant={expanded ? optionId(active) : undefined}
          disabled={choices.length === 0}
          onClick={() => (expanded ? setOpen(false) : show(selectedIndex))}
          onKeyDown={onKeyDown}
          onBlur={() => setOpen(false)}
        >
          <SizeBox>{choices[selectedIndex]?.label ?? 'Sold out'}</SizeBox>
          <SizeCaret data-size-caret />
        </SizeTrigger>
        <SizeList
          id={listId}
          role="listbox"
          aria-label={label}
          hidden={!expanded}
          // Keeps focus on the trigger so choosing an option does not blur it.
          onMouseDown={event => event.preventDefault()}
        >
          {choices.map((choice, index) => (
            <SizeOption
              key={choice.id}
              id={optionId(index)}
              role="option"
              aria-selected={index === selectedIndex}
              $active={index === active}
              onClick={() => choose(index)}
              onMouseEnter={() => activate(index)}
            >
              {choice.label}
            </SizeOption>
          ))}
        </SizeList>
      </SizeField>
    );
  }
);

export default SizePicker;
