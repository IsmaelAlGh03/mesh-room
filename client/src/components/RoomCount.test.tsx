import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RoomCount } from './RoomCount';

function seats(container: HTMLElement): { filled: number; free: number; yours: number } {
  return {
    filled: container.querySelectorAll('[data-seat="taken"]').length,
    free: container.querySelectorAll('[data-seat="free"]').length,
    yours: container.querySelectorAll('[data-seat="yours"]').length,
  };
}

describe('RoomCount', () => {
  it('invites you to share the link when the room is empty', () => {
    const { container } = render(<RoomCount count={0} capacity={6} />);

    expect(screen.getByText(/nobody else is here yet/i)).toBeInTheDocument();
    expect(seats(container)).toEqual({ filled: 0, free: 5, yours: 1 });
  });

  it('draws one node per person and leaves the rest free', () => {
    const { container } = render(<RoomCount count={3} capacity={6} />);

    expect(screen.getByText(/three people are already in this room/i)).toBeInTheDocument();
    expect(seats(container)).toEqual({ filled: 3, free: 2, yours: 1 });
  });

  it('speaks of one person in the singular', () => {
    render(<RoomCount count={1} capacity={6} />);

    expect(screen.getByText(/one person is already in this room/i)).toBeInTheDocument();
  });

  it('puts your node outside the row when every seat is taken', () => {
    const { container } = render(<RoomCount count={6} capacity={6} />);

    expect(seats(container)).toEqual({ filled: 6, free: 0, yours: 1 });
    expect(container.querySelector('[data-seat="yours"]')?.closest('[data-outside]')).not.toBeNull();
    expect(screen.getByText(/already has six people in it/i)).toBeInTheDocument();
  });

  it('keeps your node in the row while a seat remains', () => {
    const { container } = render(<RoomCount count={5} capacity={6} />);

    expect(container.querySelector('[data-seat="yours"]')?.closest('[data-outside]')).toBeNull();
  });

  it('says nothing about occupancy until the count arrives', () => {
    render(<RoomCount count={null} capacity={6} />);

    expect(screen.getByText(/counting who's here/i)).toBeInTheDocument();
  });
});
