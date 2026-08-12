import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import LobbyPage from './LobbyPage';

function renderLobby() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<LobbyPage />} />
        <Route path="/room/:roomId" element={<div>room screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LobbyPage', () => {
  it('names the product', () => {
    renderLobby();

    expect(screen.getByRole('heading', { name: /mesh.?room/i })).toBeInTheDocument();
  });

  it('opens a new room when you start one', async () => {
    const user = userEvent.setup();
    renderLobby();

    await user.click(screen.getByRole('button', { name: 'Start a room' }));

    expect(screen.getByText('room screen')).toBeInTheDocument();
  });

  it('joins the room named in a pasted link', async () => {
    const user = userEvent.setup();
    renderLobby();

    await user.type(
      screen.getByLabelText(/room link/i),
      'https://mesh-room.app/room/quiet-harbor-41',
    );
    await user.click(screen.getByRole('button', { name: 'Join' }));

    expect(screen.getByText('room screen')).toBeInTheDocument();
  });

  it('explains what to do when the pasted link is not a room', async () => {
    const user = userEvent.setup();
    renderLobby();

    await user.type(screen.getByLabelText(/room link/i), 'not a room');
    await user.click(screen.getByRole('button', { name: 'Join' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'That is not a room link. Paste the whole link, or the room name on its own.',
    );
    expect(screen.queryByText('room screen')).not.toBeInTheDocument();
  });

  it('states that media never reaches the server', () => {
    renderLobby();

    expect(screen.getByText(/never through our server/i)).toBeInTheDocument();
  });
});
