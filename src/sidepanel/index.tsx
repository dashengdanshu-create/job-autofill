import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';

const container = document.getElementById('root');
if (!container) throw new Error('#root missing from sidepanel/index.html');
createRoot(container).render(<App />);
