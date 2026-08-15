import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopyLink } from './CopyLink';

const URL_UNDER_TEST = 'https://mesh.example/room/quiet-harbour';

// userEvent.setup() installs a clipboard stub of its own, so ours has to land after it.
function arrange(overrides: Partial<Parameters<typeof CopyLink>[0]> = {}) {
  const user = userEvent.setup();
  const writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

  const props = { url: URL_UNDER_TEST, ...overrides };
  render(<CopyLink {...props} />);

  return { user, writeText, props };
}

function control(): HTMLElement {
  return screen.getByRole('button', { name: 'Copy link' });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('CopyLink', () => {
  it('puts the whole link on the clipboard', async () => {
    const { user, writeText } = arrange();

    await user.click(control());

    expect(writeText).toHaveBeenCalledWith(URL_UNDER_TEST);
  });

  it('says so once the link is copied', async () => {
    const { user } = arrange();

    await user.click(control());

    expect(await screen.findByText('Link copied')).toBeInTheDocument();
  });

  it('settles back so the next copy reads as its own', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user } = arrange();

    await user.click(control());
    expect(screen.getByText('Link copied')).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(2100);

    expect(screen.queryByText('Link copied')).not.toBeInTheDocument();
  });

  it('says what happened and what to do when the browser refuses', async () => {
    const { user, writeText } = arrange();
    writeText.mockImplementation(() => Promise.reject(new Error('denied')));

    await user.click(control());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Copying was blocked');
    expect(alert).toHaveTextContent('address bar');
  });
});
