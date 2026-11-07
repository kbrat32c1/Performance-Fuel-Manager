import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useState } from 'react';
import { SwipeableRow, type SwipeAction } from '../ui/swipeable-row';

vi.mock('@/lib/haptics', () => ({ hapticTap: () => {} }));

function makeActions(onDelete = vi.fn()): SwipeAction[] {
  return [
    { icon: null, label: 'Edit', bgColor: '', textColor: '', onClick: vi.fn() },
    { icon: null, label: 'Delete', bgColor: '', textColor: '', onClick: onDelete },
  ];
}

describe('SwipeableRow without touch', () => {
  it('opens the actions from the Actions button and runs one', async () => {
    const onDelete = vi.fn();
    render(<SwipeableRow actions={makeActions(onDelete)}><span>Rice</span></SwipeableRow>);

    const deleteBtn = screen.getByRole('button', { name: 'Delete', hidden: true });
    expect(deleteBtn).toHaveAttribute('tabindex', '-1');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Actions: Edit, Delete' }));
      await new Promise(r => requestAnimationFrame(() => r(null)));
    });

    expect(screen.getByRole('button', { name: 'Hide actions' })).toHaveAttribute('aria-expanded', 'true');
    expect(deleteBtn).toHaveAttribute('tabindex', '0');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit' }));

    fireEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Actions: Edit, Delete' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes with Escape and returns focus to the Actions button', async () => {
    render(<SwipeableRow actions={makeActions()}><span>Rice</span></SwipeableRow>);
    const toggle = screen.getByRole('button', { name: 'Actions: Edit, Delete' });

    await act(async () => {
      fireEvent.click(toggle);
      await new Promise(r => requestAnimationFrame(() => r(null)));
    });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Edit' }), { key: 'Escape' });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(toggle);
  });

  it('slides closed when the parent closes it', () => {
    function Parent() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button onClick={() => setOpen(false)}>close-from-parent</button>
          <SwipeableRow actions={makeActions()} isOpen={open} onOpenChange={setOpen}>
            <span>Rice</span>
          </SwipeableRow>
        </>
      );
    }
    render(<Parent />);
    const slider = screen.getByText('Rice').parentElement!.parentElement!;
    expect(slider.style.transform).toBe('translateX(-120px)');

    fireEvent.click(screen.getByText('close-from-parent'));
    expect(slider.style.transform).toBe('translateX(0px)');
  });

  it('hides the Actions button when disabled', () => {
    render(<SwipeableRow actions={makeActions()} disabled><span>Rice</span></SwipeableRow>);
    expect(screen.queryByRole('button', { name: /Actions:/ })).toBeNull();
  });
});
