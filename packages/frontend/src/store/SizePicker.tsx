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
    const [active, setActive] = useState(0);
    const selectedIndex = Math.max(
      0,
      choices.findIndex(choice => choice.id === value)
    );
    const optionId = (index: number) => `${listId}-${index}`;

    useEffect(() => {
      if (!open) return;
      // Touch browsers do not always blur the trigger on a tap elsewhere.
      const dismiss = (event: PointerEvent) => {
        const target = event.target;
        if (!(target instanceof Node && field.current?.contains(target))) {
          setOpen(false);
        }
      };
      document.addEventListener('pointerdown', dismiss);
      return () => document.removeEventListener('pointerdown', dismiss);
    }, [open]);

    useEffect(() => {
      if (open) {
        document
          .getElementById(`${listId}-${active}`)
          ?.scrollIntoView({block: 'nearest'});
      }
    }, [open, active, listId]);

    const show = (index: number) => {
      setActive(index);
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
      if (!open) {
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
        setActive(Math.min(active + 1, last));
      } else if (event.key === 'ArrowUp') {
        setActive(Math.max(active - 1, 0));
      } else if (event.key === 'Home') {
        setActive(0);
      } else if (event.key === 'End') {
        setActive(last);
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
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-activedescendant={open ? optionId(active) : undefined}
          disabled={choices.length === 0}
          onClick={() => (open ? setOpen(false) : show(selectedIndex))}
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
          hidden={!open}
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
              onMouseEnter={() => setActive(index)}
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
