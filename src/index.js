import React from './react';
import { CustomDom } from './CustomDom';
import './index.css';
import App from './App';
import registerServiceWorker from './registerServiceWorker';

CustomDom.render(<App />, document.getElementById('root'));
registerServiceWorker();
