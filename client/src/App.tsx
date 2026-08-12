import { Navigate, Route, Routes } from 'react-router-dom';
import { LobbyPage } from './pages/LobbyPage';
import { RoomPage } from './pages/RoomPage';

export function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<LobbyPage />} />
      <Route path="/room/:roomId" element={<RoomPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
