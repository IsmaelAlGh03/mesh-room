import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found');
}

// No StrictMode: double-invoked effects create duplicate peer connections.
createRoot(container).render(<App />);
