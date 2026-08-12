import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found');
}

// No StrictMode: double-invoked effects create duplicate peer connections.
createRoot(container).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
